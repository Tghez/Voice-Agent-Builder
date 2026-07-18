import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import { historyToMessages } from "../history";
import type { BuilderState } from "../state";

/**
 * responder — plain-language turn. For edits, summarizes the diff and points to
 * the compiled-prompt view + test call. For questions/chitchat, answers using
 * the spec as context.
 */
export async function responderNode(state: BuilderState): Promise<Partial<BuilderState>> {
  if (state.route === "edit") {
    const lines = state.diff?.summary ?? ["Updated."];
    const vtxt = state.version ? ` (v${state.version})` : "";
    const reply = state.changed
      ? `Done${vtxt} — ${lines.join(" ")} You can view the compiled prompt or place a test call.`
      : "No changes were needed — the spec already matches that.";
    return { reply, done: true };
  }

  const resp = await getAnthropic().messages.create({
    model: env.builderModel(),
    max_tokens: 1024,
    system: `You are the builder assistant for a voice sales agent. Answer the user's question concisely using the conversation and the current spec. If they just greet you, greet back and offer to help build or edit the agent.\n\nCurrent spec:\n${JSON.stringify(state.workingSpec, null, 2)}`,
    messages: historyToMessages(state.history, state.userMessage),
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { reply: text || "How can I help with your agent?", done: true };
}
