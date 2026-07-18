import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import type { BuilderState } from "../state";

/**
 * clarifier (Option B, inline) — fires only when an edit is underspecified on
 * something that matters (e.g. "qualify leads" with no criteria). Asks exactly
 * ONE targeted question and ends the turn; the next user message is a fresh
 * graph invocation. No interrupts, no checkpointer.
 */

const ClarifySchema = z.object({
  needsClarification: z.boolean(),
  question: z.string().describe("One targeted question, or empty if none needed."),
});

const SYSTEM = `You gather requirements for a voice sales agent. Given the current spec and the user's edit request, decide whether the request is underspecified on something that MATTERS — something you cannot reasonably fill with a sensible default.

Ask a clarifying question ONLY when necessary (e.g. "qualify leads" with no criteria given, or "book meetings" with no idea what qualifies). If you can proceed with reasonable defaults, do NOT ask — set needsClarification=false. When you do ask, ask exactly ONE concise, targeted question.`;

export async function clarifierNode(state: BuilderState): Promise<Partial<BuilderState>> {
  const resp = await getAnthropic().messages.parse({
    model: env.builderModel(),
    max_tokens: 400,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Current spec:\n${JSON.stringify(state.workingSpec, null, 2)}\n\nEdit request:\n${state.userMessage}`,
      },
    ],
    output_config: { format: zodOutputFormat(ClarifySchema) },
  });

  const out = resp.parsed_output;
  if (out?.needsClarification && out.question) {
    return { reply: out.question, done: true };
  }
  return { done: false };
}
