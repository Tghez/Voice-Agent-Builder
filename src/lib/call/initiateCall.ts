import { getCRM, renderLeadContext, type Lead } from "@/lib/providers/crm";
import { getAgent } from "@/lib/db/repositories/agents";
import { insertCall, setVapiCallId } from "@/lib/db/repositories/calls";
import { RealVapiClient, type VapiClient, type CreateCallPayload } from "@/lib/compiler/vapiClient";
import { env } from "@/lib/env";
import type { CallMode } from "@/lib/db/types";

/**
 * The ONE shared call service. Both the chat test-call and the dashboard
 * live-call go through here; the only difference is the `mode` tag (and whether
 * it counts toward production metrics). Batch = a later loop over this path.
 *
 * Lead context is injected PER-CALL here — the compiled assistant stays
 * lead-agnostic (see the compiler). We render the lead block and pass it via
 * assistantOverrides.variableValues into the prompt's {{leadContext}} slot.
 */

export interface InitiateCallResult {
  callId: string;
  vapiCallId: string;
  status: string;
}

/** Pure: build the Vapi POST /call payload for a lead. Unit-tested. */
export function buildCallPayload(input: {
  assistantId: string;
  phoneNumberId: string;
  lead: Lead;
  callRowId: string;
  agentId: string;
  leadId: string;
}): CreateCallPayload {
  return {
    assistantId: input.assistantId,
    phoneNumberId: input.phoneNumberId,
    // lead.phone is always DEMO_PHONE (forced by the CRM) — we never dial a prospect.
    customer: { number: input.lead.phone, name: input.lead.name },
    assistantOverrides: {
      variableValues: { leadContext: renderLeadContext(input.lead) },
    },
    metadata: {
      callRowId: input.callRowId,
      agentId: input.agentId,
      leadId: input.leadId,
    },
  };
}

export async function initiateCall(
  agentId: string,
  leadId: string,
  opts: { mode: CallMode; client?: VapiClient },
): Promise<InitiateCallResult> {
  const agent = await getAgent(agentId);
  if (!agent?.vapi_assistant_id) {
    throw new Error(`agent ${agentId} has no Vapi assistant`);
  }
  const lead = await getCRM().getLead(leadId);
  if (!lead) throw new Error(`lead ${leadId} not found`);

  // 1. Insert the call row FIRST so we have a callRowId to correlate webhooks.
  const row = await insertCall({ agentId, leadId, mode: opts.mode });

  // 2. Place the call with per-call lead context + correlation metadata.
  const client = opts.client ?? new RealVapiClient();
  const payload = buildCallPayload({
    assistantId: agent.vapi_assistant_id,
    phoneNumberId: env.vapiPhoneNumberId(),
    lead,
    callRowId: row.id,
    agentId,
    leadId,
  });
  const call = await client.createCall(payload);

  // 3. Record the Vapi call id on our row.
  await setVapiCallId(row.id, call.id, call.status);

  return { callId: row.id, vapiCallId: call.id, status: call.status ?? "queued" };
}
