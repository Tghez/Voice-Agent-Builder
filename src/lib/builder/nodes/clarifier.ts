import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import { historyToMessages } from "../history";
import type { BuilderState } from "../state";

/**
 * clarifier (Option B, inline) — entered only when the router already decided
 * (in its own structured output) that this edit is underspecified. The router
 * is the single source of truth for THAT decision; this node's only job is to
 * formulate the ONE targeted question. The question text flows to responder,
 * which does the actual streaming write. The turn ends after responder
 * replies; the next user message is a fresh graph invocation. No interrupts,
 * no checkpointer.
 */

const ClarifySchema = z.object({
  question: z.string().describe("One concise, targeted question."),
});

const SYSTEM = `You gather requirements for a voice sales agent. The router has already determined the LATEST request is underspecified on something that matters and cannot reasonably be filled with a sensible default (e.g. "qualify leads" with no criteria given). Using the full conversation, the current spec, and the router's stated reason for flagging it, ask exactly ONE concise, targeted question that resolves the gap. Trust the router's reason for what's missing rather than re-deriving it from scratch — but use your own judgment if it's off.`;

export async function clarifierNode(state: BuilderState): Promise<Partial<BuilderState>> {
  const resp = await getAnthropic().messages.parse({
    model: env.builderModel(),
    max_tokens: 400,
    system: `${SYSTEM}\n\nRouter's reason this needs clarification: ${state.routeReason ?? "(not given)"}\n\nCurrent spec:\n${JSON.stringify(state.workingSpec, null, 2)}`,
    messages: historyToMessages(state.history, state.userMessage),
    output_config: { format: zodOutputFormat(ClarifySchema) },
  });

  const question = resp.parsed_output?.question;
  return { reply: question, done: true };
}
