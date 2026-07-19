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
    const reply = state.changed
      ? `Done — ${lines.join(" ")} You can view the compiled prompt or place a test call.`
      : "No changes were needed — the spec already matches that.";
    write?.(reply);
    return { reply, done: true };
  }

  // No agentId means nothing has been created/persisted this session yet —
  // workingSpec is just the blank starting template, not a real agent. Don't
  // hand it to the LLM as "current spec" context or it'll invent an example.
  const system = state.agentId
    ? `You are the builder assistant for a voice sales agent. Answer the user's question concisely using the conversation and the current spec. If they just greet you, greet back and offer to help build or edit the agent.\n\nCurrent spec:\n${JSON.stringify(state.workingSpec, null, 2)}`
    : `You are the builder assistant for a voice sales agent. No agent has been created in this session yet. Answer the user's question concisely using only the conversation so far. Do NOT invent or reference any example agent, name, or persona. If asked what you can help with, explain generally: you can configure identity (name/persona/voice/greeting), goal, lead-qualification criteria, actions (qualify leads, check availability, book meetings, schedule callbacks), and guardrails — then invite them to describe the agent they want.`;

  const stream = getAnthropic().messages.stream({
    model: env.builderModel(),
    max_tokens: 1024,
    system,
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
