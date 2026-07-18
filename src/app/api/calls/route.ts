import { NextResponse } from "next/server";
import { initiateCall } from "@/lib/call/initiateCall";
import { listCalls } from "@/lib/db/repositories/calls";
import type { CallMode } from "@/lib/db/types";

/** List calls for the dashboard (newest first). */
export async function GET() {
  try {
    return NextResponse.json({ calls: await listCalls() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Place a call. The ONE hard confirmation gate: the request must carry
 * confirm:true (the UI shows "Call {lead} now? ~$0.13/min · real call" first).
 * Without it we refuse — a call costs money and rings a real phone.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { agentId, leadId, mode, confirm } = body ?? {};

  if (!agentId || !leadId) {
    return NextResponse.json({ error: "agentId and leadId are required" }, { status: 400 });
  }
  if (confirm !== true) {
    return NextResponse.json(
      { error: "confirmation required — a call costs money and rings a real phone" },
      { status: 428 },
    );
  }

  const callMode: CallMode = mode === "live" ? "live" : "test";
  try {
    const result = await initiateCall(agentId, leadId, { mode: callMode });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
