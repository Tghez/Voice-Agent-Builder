import type Anthropic from "@anthropic-ai/sdk";
import type { AgentSpec } from "@/lib/spec/schema";

/**
 * Anthropic tool definitions for the runtime tools, derived from a spec. Used by
 * the text-mode eval harness so the agent talks to the LLM-as-lead with the SAME
 * tools it uses on a real call. qualify_lead's params are derived from the
 * qualification criteria (one source), matching the compiler.
 */

function fieldType(value: unknown): string {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

export function runtimeToolDefsForSpec(spec: AgentSpec): Anthropic.Tool[] {
  const defs: Anthropic.Tool[] = [];

  for (const action of spec.actions) {
    switch (action) {
      case "qualify_lead": {
        const properties: Record<string, unknown> = {};
        for (const c of spec.qualification.criteria) {
          properties[c.field] = {
            type: fieldType(c.value),
            description: c.label ?? `Extracted value for "${c.field}"`,
          };
        }
        defs.push({
          name: "qualify_lead",
          description:
            "Record the lead's answers and score them against the qualification criteria. Call as soon as you have the answers.",
          input_schema: { type: "object", properties, additionalProperties: false },
        });
        break;
      }
      case "check_availability":
        defs.push({
          name: "check_availability",
          description: "Fetch open meeting slots.",
          input_schema: { type: "object", properties: {}, additionalProperties: false },
        });
        break;
      case "book_meeting":
        defs.push({
          name: "book_meeting",
          description: "Book a meeting at the chosen slot and return confirmation.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              slot: { type: "string", description: "ISO 8601 datetime of the chosen slot" },
            },
            required: ["slot"],
            additionalProperties: false,
          },
        });
        break;
      case "schedule_callback":
        defs.push({
          name: "schedule_callback",
          description: "Log a callback request for a lead who didn't qualify or wants to be reached later.",
          input_schema: {
            type: "object",
            properties: {
              reason: { type: "string" },
              preferred_time: { type: "string" },
            },
            additionalProperties: false,
          },
        });
        break;
    }
  }

  return defs;
}
