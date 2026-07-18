import { INCALL_MODEL } from "@/lib/config";
import type { AgentSpec, Criterion, RuntimeTool, Voice } from "@/lib/spec/schema";
import { renderPrompt } from "./renderPrompt";

/**
 * vapiMap — pure, deterministic translation of an AgentSpec into a Vapi Assistant
 * object. This is the ONLY place that knows Vapi's schema. Same spec in →
 * byte-identical object out (unit-tested). No I/O, no LLM.
 *
 * Field names verified against Vapi API docs (assistants/create, calls/create):
 * model{provider,model,temperature,messages,tools}, voice{provider,voiceId},
 * transcriber{provider,model,language}, server{url}, analysisPlan.structuredDataPlan.schema.
 */

/**
 * Voice → Cartesia voiceId (real Sonic voice UUIDs from the Cartesia voice
 * library). Kept in this one file so swapping voices is a single-place change.
 *   Katie   f786b574-… en-US female   Skylar  db6b0ed5-… en-US female
 *   Jameson a5136bf9-… en-US male     Greg    a0e99841-… en-US male
 */
const VOICE_TO_CARTESIA: Record<Voice, string> = {
  "friendly-female": "f786b574-daa5-4673-aa0c-cbe3e8534c02", // Katie
  "friendly-male": "a5136bf9-224c-4d76-b823-52bd5efcffcc", // Jameson
  "professional-female": "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4", // Skylar
  "professional-male": "a0e99841-438c-4a64-b679-ae501e7d6091", // Greg
};

type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean;
};

/** Infer a loose JSON-schema type for a criterion's answer field. */
function fieldType(c: Criterion): string {
  if (typeof c.value === "number") return "number";
  if (typeof c.value === "boolean") return "boolean";
  if (Array.isArray(c.value)) return "string";
  return "string";
}

/** qualify_lead's parameters are derived from the qualification criteria —
 *  one source drives extraction, scoring, AND the outcome schema. */
function qualifyLeadParams(spec: AgentSpec): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const c of spec.qualification.criteria) {
    properties[c.field] = {
      type: fieldType(c),
      description: c.label ?? `Extracted value for "${c.field}"`,
    };
  }
  return { type: "object", properties, additionalProperties: false };
}

function toolParameters(spec: AgentSpec, tool: RuntimeTool): JsonSchema {
  switch (tool) {
    case "qualify_lead":
      return qualifyLeadParams(spec);
    case "check_availability":
      return { type: "object", properties: {}, additionalProperties: false };
    case "book_meeting":
      return {
        type: "object",
        properties: {
          name: { type: "string", description: "Lead's full name" },
          email: { type: "string", description: "Lead's email" },
          slot: { type: "string", description: "ISO 8601 datetime of the chosen slot" },
        },
        required: ["slot"],
        additionalProperties: false,
      };
    case "schedule_callback":
      return {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why a callback is needed" },
          preferred_time: { type: "string", description: "Lead's preferred callback time, if given" },
        },
        additionalProperties: false,
      };
  }
}

const TOOL_DESCRIPTIONS: Record<RuntimeTool, string> = {
  qualify_lead:
    "Record the lead's answers and score them against the qualification criteria. Call as soon as you have the answers.",
  check_availability: "Fetch open meeting slots from the calendar.",
  book_meeting: "Book a meeting at the chosen slot and return a confirmation.",
  schedule_callback: "Log a callback request for a lead who did not qualify or wants to be reached later.",
};

function toVapiTool(spec: AgentSpec, tool: RuntimeTool, toolsUrl: string) {
  return {
    type: "function" as const,
    function: {
      name: tool,
      description: TOOL_DESCRIPTIONS[tool],
      parameters: toolParameters(spec, tool),
    },
    server: { url: toolsUrl },
  };
}

/** analysisPlan.structuredDataPlan.schema — derived from qualification so the
 *  qualification definition drives BOTH agent behavior and outcome-metric shape. */
function structuredDataSchema(spec: AgentSpec): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    qualified: { type: "boolean", description: "Did the lead pass qualification?" },
  };
  for (const c of spec.qualification.criteria) {
    properties[c.field] = {
      type: fieldType(c),
      description: c.label ?? `Extracted value for "${c.field}"`,
    };
  }
  properties.meeting_booked = { type: "boolean" };
  properties.callback_scheduled = { type: "boolean" };
  return { type: "object", properties };
}

export interface BuildOptions {
  /** Public base URL (e.g. https://app.vercel.app) for webhook server.url values. */
  baseUrl: string;
}

/**
 * Pure spec → Vapi Assistant object. The returned object is what we POST/PATCH.
 * Deterministic: given the same spec + baseUrl, the JSON is byte-identical.
 */
export function buildVapiAssistant(spec: AgentSpec, opts: BuildOptions) {
  const toolsUrl = `${opts.baseUrl}/api/vapi/tools`;
  const eventsUrl = `${opts.baseUrl}/api/vapi/events`;

  return {
    name: spec.identity.name,
    firstMessage: spec.identity.firstMessage,
    model: {
      provider: "anthropic",
      model: INCALL_MODEL,
      temperature: 0.4,
      messages: [{ role: "system", content: renderPrompt(spec) }],
      tools: spec.actions.map((t) => toVapiTool(spec, t, toolsUrl)),
    },
    voice: {
      provider: "cartesia",
      voiceId: VOICE_TO_CARTESIA[spec.identity.voice],
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en",
    },
    server: { url: eventsUrl },
    analysisPlan: {
      structuredDataPlan: { schema: structuredDataSchema(spec) },
    },
  };
}
