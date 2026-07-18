import { NextResponse } from "next/server";
import { getAgent, getCurrentSpec } from "@/lib/db/repositories/agents";
import { renderPrompt } from "@/lib/compiler/renderPrompt";

/** Fetch one agent's current spec (+ its compiled prompt) so the Builder can
 *  load and continue editing an existing agent. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const agent = await getAgent(id);
    if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });
    const spec = await getCurrentSpec(agent);
    return NextResponse.json({
      agent,
      spec,
      compiledPrompt: spec ? renderPrompt(spec) : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
