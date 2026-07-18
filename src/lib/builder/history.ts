import type Anthropic from "@anthropic-ai/sdk";
import type { ChatTurn } from "./state";

/**
 * Turn this session's chat history + the current message into the Anthropic
 * messages array every LLM node uses, so each node sees the full conversation
 * for this assistant creation. History ends with the assistant's last reply
 * (or is empty), then the current user message is appended.
 */
export function historyToMessages(
  history: ChatTurn[] | undefined,
  current: string,
): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = (history ?? [])
    .filter((h) => h.content && h.content.trim().length > 0)
    .map((h) => ({ role: h.role, content: h.content }));
  msgs.push({ role: "user", content: current });
  return msgs;
}
