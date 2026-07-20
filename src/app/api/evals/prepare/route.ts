import { NextResponse } from "next/server";
import { getAgent, getCurrentSpec } from "@/lib/db/repositories/agents";
import { getOrCreatePersonaSet } from "@/lib/evals/personaSet";

/**
 * Phase 1 of a run: ensure the agent's golden persona set exists and is current.
 * This is the ONLY place a persona-generation LLM call can happen. On every run
 * except the first for an agent (or the first after a qualification-relevant
 * spec edit) it's a fast DB read-and-return.
 */
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const agentId = body?.agentId;
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  try {
    const agent = await getAgent(agentId);
    if (!agent) throw new Error(`agent ${agentId} not found`);
    const spec = await getCurrentSpec(agent);
    if (!spec) throw new Error(`no current spec for agent ${agentId}`);

    const { regenerated } = await getOrCreatePersonaSet(agent, spec);
    return NextResponse.json({ regenerated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
