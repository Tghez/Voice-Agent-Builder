import { getWriter } from "@langchain/langgraph";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import { historyToMessages } from "../history";
import type { BuilderState } from "../state";

/**
 * responder — plain-language turn. For edits, summarizes the diff and points to
 * the compiled-prompt view + test call. For questions/chitchat, answers using
 * the spec as context. Streams its reply token-by-token via the graph's custom
 * stream channel (consumed by the API route as SSE).
 */
export async function responderNode(state: BuilderState): Promise<Partial<BuilderState>> {
  // Captured synchronously so it works from inside the stream's "text" event
  // callback, which runs outside the AsyncLocalStorage context getWriter() relies on.
  const write = getWriter();

  if (state.route === "edit") {
    const lines = state.diff?.summary ?? ["Updated."];
    const vtxt = state.version ? ` (v${state.version})` : "";
    const reply = state.changed
      ? `Done${vtxt} — ${lines.join(" ")} You can view the compiled prompt or place a test call.`
      : "No changes were needed — the spec already matches that.";
    write?.(reply);
    return { reply, done: true };
  }

  const stream = getAnthropic().messages.stream({
    model: env.builderModel(),
    max_tokens: 1024,
    system: `You are the builder assistant for a voice sales agent. Answer the user's question concisely using the conversation and the current spec. If they just greet you, greet back and offer to help build or edit the agent.\n\nCurrent spec:\n${JSON.stringify(state.workingSpec, null, 2)}`,
    messages: historyToMessages(state.history, state.userMessage),
  });
  stream.on("text", (delta) => write?.(delta));
  const final = await stream.finalMessage();

  const text = final.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  if (!text) write?.("How can I help with your agent?");
  return { reply: text || "How can I help with your agent?", done: true };
}
