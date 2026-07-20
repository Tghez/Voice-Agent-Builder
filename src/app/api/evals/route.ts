import { NextResponse } from "next/server";
import { runEval } from "@/lib/evals/runner";
import { listRuns, getCase } from "@/lib/db/repositories/evals";

// The harness runs ~10 two-agent conversations; give it room.
export const maxDuration = 300;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const caseId = params.get("caseId");
  try {
    // One full case for the detail drawer.
    if (caseId) {
      return NextResponse.json({ case: await getCase(caseId) });
    }
    const agentId = params.get("agentId") ?? undefined;
    return NextResponse.json({ runs: await listRuns(agentId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const agentId = body?.agentId;
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  try {
    const summary = await runEval(agentId);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
