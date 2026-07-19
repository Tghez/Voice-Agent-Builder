import { serviceClient } from "@/lib/db/client";
import type { CallMode, CallRow, StructuredOutcome } from "@/lib/db/types";

/**
 * Calls repository. A row is created at initiateCall time; runtime tools merge
 * into structured_outcome during the call; the end-of-call webhook fills
 * transcript/recording/cost/duration.
 */

export async function insertCall(input: {
  agentId: string;
  leadId: string;
  mode: CallMode;
  vapiCallId?: string | null;
  status?: string | null;
}): Promise<CallRow> {
  const db = serviceClient();
  const { data, error } = await db
    .from("calls")
    .insert({
      agent_id: input.agentId,
      lead_id: input.leadId,
      mode: input.mode,
      vapi_call_id: input.vapiCallId ?? null,
      status: input.status ?? "initiated",
      structured_outcome: {},
    })
    .select()
    .single<CallRow>();
  if (error) throw error;
  return data;
}

export async function setVapiCallId(
  callId: string,
  vapiCallId: string,
  status?: string | null,
): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from("calls")
    .update({ vapi_call_id: vapiCallId, status: status ?? "queued" })
    .eq("id", callId);
  if (error) throw error;
}

export async function findByVapiCallId(vapiCallId: string): Promise<CallRow | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("calls")
    .select("*")
    .eq("vapi_call_id", vapiCallId)
    .maybeSingle<CallRow>();
  if (error) throw error;
  return data;
}

/**
 * Find the row for a Vapi call id, or lazily create one. Calls placed outside
 * our own /api/calls flow (e.g. Vapi's browser test widget) carry no
 * callRowId metadata, so the webhook handlers fall back to this — the row
 * still shows up on the dashboard, just with no known lead.
 */
export async function getOrCreateCallRow(vapiCallId: string, agentId: string): Promise<CallRow> {
  const existing = await findByVapiCallId(vapiCallId);
  if (existing) return existing;

  const db = serviceClient();
  const { data, error } = await db
    .from("calls")
    .insert({
      agent_id: agentId,
      lead_id: null,
      mode: "test",
      vapi_call_id: vapiCallId,
      status: "in-progress",
      structured_outcome: {},
    })
    .select()
    .single<CallRow>();
  if (error) throw error;
  return data;
}

/** Shallow-merge a partial outcome into structured_outcome (read-then-write). */
export async function mergeOutcome(
  callId: string,
  patch: Partial<StructuredOutcome>,
): Promise<void> {
  const db = serviceClient();
  const { data, error } = await db
    .from("calls")
    .select("structured_outcome")
    .eq("id", callId)
    .single<{ structured_outcome: StructuredOutcome | null }>();
  if (error) throw error;

  const merged: StructuredOutcome = { ...(data.structured_outcome ?? {}), ...patch };
  const { error: uerr } = await db
    .from("calls")
    .update({ structured_outcome: merged })
    .eq("id", callId);
  if (uerr) throw uerr;
}

/** Fields from the Vapi end-of-call-report. */
export async function applyEndOfCall(
  callId: string,
  fields: {
    status?: string;
    transcript?: unknown;
    recording_url?: string | null;
    duration_sec?: number | null;
    cost_usd?: number | null;
  },
): Promise<void> {
  const db = serviceClient();
  const { error } = await db.from("calls").update(fields).eq("id", callId);
  if (error) throw error;
}

export async function listCalls(): Promise<CallRow[]> {
  const db = serviceClient();
  const { data, error } = await db.from("calls").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CallRow[];
}
