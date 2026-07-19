import { NextResponse } from "next/server";
import { insertCall } from "@/lib/db/repositories/calls";
import type { CallMode } from "@/lib/db/types";

/**
 * Register a browser-placed call (started client-side via the Vapi Web SDK,
 * see the dashboard's Call button). Unlike /api/calls, this doesn't place the
 * call — the browser already did, via vapi.start() — it just records the row
 * up front with the right lead/mode so it shows up on the dashboard, rather
 * than relying on the webhook's lazy no-lead-id fallback.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { agentId, leadId, mode, vapiCallId } = body ?? {};

  if (!agentId || !leadId || !vapiCallId) {
    return NextResponse.json(
      { error: "agentId, leadId, and vapiCallId are required" },
      { status: 400 },
    );
  }

  const callMode: CallMode = mode === "test" ? "test" : "live";
  try {
    const row = await insertCall({
      agentId,
      leadId,
      mode: callMode,
      vapiCallId,
      status: "in-progress",
    });
    return NextResponse.json({ callId: row.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
