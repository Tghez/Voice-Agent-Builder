import { NextResponse } from "next/server";
import {
  applyEndOfCall,
  findByVapiCallId,
  getOrCreateCallRow,
  getOutcome,
  mergeOutcome,
} from "@/lib/db/repositories/calls";
import { getAgentByAssistantId } from "@/lib/db/repositories/agents";
import { getCRM } from "@/lib/providers/crm";
import { scoreIntent } from "@/lib/scoring/intent";
import { transcriptToText } from "@/lib/transcript";
import type { StructuredOutcome } from "@/lib/db/types";

/**
 * Vapi end-of-call webhook. Vapi POSTs many message types here; we act only on
 * "end-of-call-report".
 *
 * INVARIANT: persist the calls row FIRST (transcript/recording/cost/duration),
 * THEN run Track-2 intent and patch it in. A flaky/timed-out intent call must
 * never lose the call record — that would destroy a demo recording.
 */

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = body?.message ?? {};
  if (message.type !== "end-of-call-report") {
    return NextResponse.json({ ok: true, ignored: message.type ?? "unknown" });
  }

  const call = message.call ?? {};
  const meta = call.metadata ?? {};
  const artifact = message.artifact ?? {};

  // 1) Correlate to our call row (metadata first, else by Vapi call id, else
  //    lazily create one — a call placed outside our /api/calls flow, e.g.
  //    Vapi's browser test widget, may never have hit the tools webhook at
  //    all if the model made no tool calls).
  let callRowId: string | null = meta.callRowId ?? null;
  let leadId: string | null = meta.leadId ?? null;
  if (!callRowId && call.id) {
    const row = await findByVapiCallId(call.id);
    if (row) {
      callRowId = row.id;
      leadId = leadId ?? row.lead_id ?? null;
    } else {
      const assistantId = call.assistantId ?? message.assistant?.id;
      const agent = assistantId ? await getAgentByAssistantId(assistantId) : null;
      if (agent) callRowId = (await getOrCreateCallRow(call.id, agent.id)).id;
    }
  }
  if (!callRowId) {
    return NextResponse.json({ ok: true, note: "no matching call row" });
  }

  const rawTranscript = artifact.transcript ?? message.transcript ?? null;
  const recording_url =
    artifact.recordingUrl ?? artifact.recording?.url ?? message.recordingUrl ?? null;
  const duration_sec =
    message.durationSeconds ?? call.duration ?? message.duration ?? null;
  const cost_usd = message.cost ?? call.cost ?? null;
  const status = message.endedReason ?? "ended";

  // 2) PERSIST FIRST — never lose the record.
  await applyEndOfCall(callRowId, {
    status,
    transcript: rawTranscript,
    recording_url,
    duration_sec,
    cost_usd,
  });

  // Capture Vapi's structured extraction if present (from analysisPlan) — but
  // only to FILL IN fields the in-call tools never set (e.g. the call dropped
  // before qualify_lead/book_meeting ran). qualify_lead and book_meeting/
  // schedule_callback are the deterministic ground truth for these fields;
  // Vapi's own end-of-call transcript analysis must never overwrite them,
  // the same way Track-2 intent below is advisory and never overrides a
  // hard gate.
  const structured = message.analysis?.structuredData;
  if (structured && typeof structured === "object") {
    const s = structured as Record<string, unknown>;
    const existing = await getOutcome(callRowId);
    const patch: Partial<StructuredOutcome> = {};
    if (existing?.extracted === undefined) patch.extracted = s;
    if (existing?.meeting_booked === undefined) patch.meeting_booked = Boolean(s.meeting_booked);
    if (existing?.callback_scheduled === undefined) patch.callback_scheduled = Boolean(s.callback_scheduled);
    if (Object.keys(patch).length > 0) await mergeOutcome(callRowId, patch);
  }

  // 3) Track-2 intent — advisory, failure-tolerant.
  try {
    const notes = leadId ? (await getCRM().getLead(leadId))?.notes ?? "" : "";
    const intent = await scoreIntent(transcriptToText(rawTranscript), notes);
    await mergeOutcome(callRowId, { intent });
  } catch (e) {
    console.error("Track-2 intent scoring failed (non-fatal):", (e as Error).message);
    await mergeOutcome(callRowId, { intent: null });
  }

  return NextResponse.json({ ok: true });
}
