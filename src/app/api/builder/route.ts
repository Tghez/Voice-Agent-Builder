import { NextResponse } from "next/server";
import { builderGraph } from "@/lib/builder/graph";
import { emptySpec, type AgentSpec } from "@/lib/spec/schema";
import { getAgent, getCurrentSpec } from "@/lib/db/repositories/agents";
import type { ChatTurn } from "@/lib/builder/state";

/**
 * One chat turn → one graph invocation. For edits to an existing agent we load
 * its current spec (with vapiAssistantId) so the editor diffs against real state
 * and the compiler PATCHes the same assistant. New agents start from emptySpec().
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  const agentId: string | undefined = body?.agentId || undefined;
  // Full chat history of THIS assistant-creation session (from the client),
  // threaded into every node so the graph has conversation memory.
  const history: ChatTurn[] = Array.isArray(body?.history)
    ? body.history
        .filter(
          (h: unknown): h is ChatTurn =>
            !!h &&
            typeof h === "object" &&
            (((h as ChatTurn).role === "user") || ((h as ChatTurn).role === "assistant")) &&
            typeof (h as ChatTurn).content === "string",
        )
        .slice(-20)
    : [];
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  let workingSpec: AgentSpec;
  let prevSpec: AgentSpec | null = null;
  if (agentId) {
    const agent = await getAgent(agentId);
    const spec = agent ? await getCurrentSpec(agent) : null;
    workingSpec = spec ?? emptySpec();
    prevSpec = spec ? structuredClone(spec) : null;
  } else {
    workingSpec = emptySpec();
  }

  try {
    const result = await builderGraph.invoke({
      userMessage: message,
      history,
      agentId,
      workingSpec,
      prevSpec,
    });

    return NextResponse.json({
      reply: result.reply ?? "",
      route: result.route ?? null,
      agentId: result.agentId ?? agentId ?? null,
      version: result.version ?? null,
      diff: result.diff ?? null,
      compiledPrompt: result.compiledPrompt ?? null,
      testCall: result.testCall ?? null,
      spec: result.workingSpec,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
