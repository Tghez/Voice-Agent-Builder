import { getCalendar } from "@/lib/providers/calendar";
import {
  getAgent,
  getAgentByAssistantId,
  getCurrentSpec,
} from "@/lib/db/repositories/agents";
import { mergeOutcome } from "@/lib/db/repositories/calls";
import type { Qualification } from "@/lib/spec/schema";
import type { ToolSession } from "./handlers";

/** Correlation info pulled from the Vapi webhook's message.call. */
export interface WebhookToolContext {
  callRowId?: string; // our calls.id (set via call metadata)
  agentId?: string; // our agents.id (set via call metadata)
  assistantId?: string; // fallback lookup key
}

const EMPTY_QUALIFICATION: Qualification = {
  criteria: [],
  scoring: { mode: "weighted", passScore: 60 },
};

/**
 * Build a live ToolSession from webhook context: resolve the agent's current
 * qualification (by our agentId, else by Vapi assistantId), wire the calendar
 * provider, and persist outcomes to the correlated calls row.
 */
export async function buildToolSession(ctx: WebhookToolContext): Promise<ToolSession> {
  let agent = ctx.agentId ? await getAgent(ctx.agentId) : null;
  if (!agent && ctx.assistantId) agent = await getAgentByAssistantId(ctx.assistantId);
  const spec = agent ? await getCurrentSpec(agent) : null;

  return {
    qualification: spec?.qualification ?? EMPTY_QUALIFICATION,
    calendar: getCalendar(),
    persistOutcome: async (patch) => {
      if (ctx.callRowId) await mergeOutcome(ctx.callRowId, patch);
    },
  };
}
