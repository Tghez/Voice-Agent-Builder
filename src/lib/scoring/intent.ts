import { z } from "zod/v4"; // Anthropic's zodOutputFormat helper targets Zod v4 internals
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import type { IntentResult } from "@/lib/db/types";

/**
 * Track 2 — Intent (LLM, POST-call, off the critical path). Reads the
 * UNSTRUCTURED side: the full transcript plus the lead's CRM notes, and scores
 * buying intent / readiness — urgency, buying-stage language, hesitation,
 * objections — the signals rigid firmographic rules miss.
 *
 * ADVISORY ONLY. It never gates an outcome (Track-1 fit decides). Non-
 * deterministic by design; the same transcript may score 44 vs 48 — acceptable
 * precisely because it decides nothing.
 */

const IntentSchema = z.object({
  intent_score: z.number(), // 0–100 (clamped after parse)
  stage: z.enum(["researching", "evaluating", "ready_to_buy"]),
  urgency: z.enum(["low", "medium", "high"]),
  signals: z.array(z.string()),
  objections: z.array(z.string()),
});

const SYSTEM = `You are a sales-intent analyst. Given a phone call transcript and the lead's CRM notes, judge the lead's BUYING INTENT and readiness to move — not their firmographic fit (that is scored separately).

Weigh language signals: urgency ("we need this by Q3"), buying-stage cues ("what is an AI SDR" = researching vs "how does this integrate with our CRM" = evaluating vs "what does onboarding look like" = ready_to_buy), hesitation, and explicit objections.

Return:
- intent_score: 0–100 overall buying intent.
- stage: researching | evaluating | ready_to_buy.
- urgency: low | medium | high.
- signals: short phrases evidencing intent.
- objections: concerns or blockers the lead raised.`;

export async function scoreIntent(transcript: string, notes: string): Promise<IntentResult> {
  const resp = await getAnthropic().messages.parse({
    model: env.builderModel(),
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Lead CRM notes:\n${notes || "(none)"}\n\n---\nCall transcript:\n${transcript || "(empty)"}`,
      },
    ],
    output_config: { format: zodOutputFormat(IntentSchema) },
  });

  const out = resp.parsed_output;
  if (!out) throw new Error("intent scoring returned no structured output");
  return { ...out, intent_score: Math.max(0, Math.min(100, Math.round(out.intent_score))) };
}
