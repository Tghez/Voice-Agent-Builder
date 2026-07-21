import { NextResponse } from "next/server";
import { builderGraph } from "@/lib/builder/graph";
import { emptySpec, type AgentSpec } from "@/lib/spec/schema";
import { getAgent, getCurrentSpec } from "@/lib/db/repositories/agents";
import type { BuilderState, ChatTurn } from "@/lib/builder/state";

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let finalState: Partial<BuilderState> | null = null;
      try {
        const events = await builderGraph.stream(
          { userMessage: message, history, agentId, workingSpec, prevSpec },
          {
            runName: "builder-turn",
            tags: agentId ? [`agent:${agentId}`] : ["agent:new"],
            streamMode: ["custom", "values"],
          },
        );
        for await (const [mode, chunk] of events) {
          if (mode === "custom") {
            // The custom channel carries two shapes: plain-string text tokens
            // (responder/clarifier) and status objects (editor/compiler
            // progress). Route each to its own SSE event so progress never
            // lands in the reply text.
            if (typeof chunk === "string") {
              controller.enqueue(encoder.encode(sseEvent("token", { text: chunk })));
            } else if (chunk && typeof chunk === "object" && (chunk as { kind?: string }).kind === "status") {
              const s = chunk as { label?: string; done?: boolean };
              controller.enqueue(
                encoder.encode(sseEvent("status", { label: s.label ?? "", done: !!s.done })),
              );
            }
          } else if (mode === "values") {
            finalState = chunk as Partial<BuilderState>;
          }
        }
        const resolvedAgentId = finalState?.agentId ?? agentId ?? null;
        controller.enqueue(
          encoder.encode(
            sseEvent("done", {
              reply: finalState?.reply ?? "",
              route: finalState?.route ?? null,
              agentId: resolvedAgentId,
              diff: finalState?.diff ?? null,
              compiledPrompt: finalState?.compiledPrompt ?? null,
              testCall: finalState?.testCall ?? null,
              // No agentId means no agent has actually been created/persisted
              // yet — workingSpec is just the blank starting template, not a
              // real spec, so don't send it (the client would render it as
              // if an agent exists).
              spec: resolvedAgentId ? finalState?.workingSpec : null,
            }),
          ),
        );
      } catch (e) {
        controller.enqueue(encoder.encode(sseEvent("error", { error: (e as Error).message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
