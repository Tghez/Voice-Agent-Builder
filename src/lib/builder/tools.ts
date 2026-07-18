import type Anthropic from "@anthropic-ai/sdk";

/**
 * The builder's tool surface (Anthropic tool definitions). The editor node calls
 * these; every mutating call maps 1:1 to applyToSpec. `get_current_spec` is a
 * READ the model must call before any partial edit (enforced in the system
 * prompt) so it diffs against real state instead of blind-overwriting.
 */

const VOICE_ENUM = ["friendly-female", "friendly-male", "professional-female", "professional-male"];
const OP_ENUM = [">=", "<=", "==", "!=", ">", "<", "in", "not_in", "contains", "exists"];
const RUNTIME_TOOLS = ["qualify_lead", "check_availability", "book_meeting", "schedule_callback"];

export const BUILDER_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_current_spec",
    description:
      "Read the current agent spec. ALWAYS call this before any partial edit so you diff against the real current state instead of overwriting fields the user did not mention.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "configure_identity",
    description:
      "Set identity fields. Provide ONLY the fields you want to change — omitted fields are preserved.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        persona: { type: "string", description: "How the agent speaks/behaves." },
        voice: { type: "string", enum: VOICE_ENUM },
        firstMessage: { type: "string", description: "The agent's opening line." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "configure_qualification",
    description:
      "Replace the qualification criteria and (optionally) scoring. `gate:true` makes a criterion a hard requirement; `weight` feeds the weighted score.",
    input_schema: {
      type: "object",
      properties: {
        criteria: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: "Lead/answer field, e.g. team_size." },
              op: { type: "string", enum: OP_ENUM },
              value: {},
              weight: { type: "number" },
              gate: { type: "boolean" },
              label: { type: "string", description: "Human phrasing for the prompt." },
            },
            required: ["field", "op", "value"],
          },
        },
        scoring: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["weighted", "all", "any"] },
            passScore: { type: "number" },
          },
        },
      },
      required: ["criteria"],
      additionalProperties: false,
    },
  },
  {
    name: "configure_actions",
    description: "Set which runtime tools the voice agent may use during the call.",
    input_schema: {
      type: "object",
      properties: {
        tools: { type: "array", items: { type: "string", enum: RUNTIME_TOOLS } },
      },
      required: ["tools"],
      additionalProperties: false,
    },
  },
  {
    name: "set_goal",
    description: "Set the agent's goal for the call.",
    input_schema: {
      type: "object",
      properties: { goal: { type: "string" } },
      required: ["goal"],
      additionalProperties: false,
    },
  },
  {
    name: "set_guardrails",
    description: "Replace the guardrail rules (things the agent must never do).",
    input_schema: {
      type: "object",
      properties: { guardrails: { type: "array", items: { type: "string" } } },
      required: ["guardrails"],
      additionalProperties: false,
    },
  },
];

export const BUILDER_TOOL_NAMES = BUILDER_TOOLS.map((t) => t.name);
