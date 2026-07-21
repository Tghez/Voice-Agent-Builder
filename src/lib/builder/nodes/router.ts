import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import { historyToMessages } from "../history";
import type { BuilderState, Route } from "../state";

/**
 * intent_router — classify the turn so "call lead 3" and "make her friendlier"
 * don't collide. Routes: edit · question · test_call · chitchat.
 */

const RouteSchema = z.object({
  route: z.enum(["edit", "question", "test_call", "chitchat"]),
  needsClarification: z
    .boolean()
    .describe(
      "route=edit only: true if the request is underspecified on something that matters and can't be filled with a sensible default. Always false for other routes.",
    ),
  reason: z
    .string()
    .describe(
      "Brief reason for the classification. If needsClarification is true, name specifically what's missing or ambiguous — this is handed to the clarifier so it can ask a targeted question instead of re-deriving the gap.",
    ),
});

const SYSTEM = `You route messages sent to a builder that creates/edits a voice sales agent via natural language. Classify the user's latest message:
- "edit": they want to create or change the agent's configuration (identity, goal, qualification criteria, guardrails). e.g. "make her friendlier", "qualify on team size ≥ 10", "never quote pricing".
- "question": they're asking about the current agent/configuration. e.g. "what criteria does it use?", "show the prompt".
- "test_call": they want to place/test a call. e.g. "call lead 3", "test it on Jordan".
- "chitchat": greetings or anything else.
Prefer "edit" when they express a desired change to the agent. If the assistant's previous message asked a clarifying question and the user's latest message answers it (e.g. provides the criteria that were requested), classify as "edit".

For "edit" routes only, also decide needsClarification: true ONLY when the request is underspecified on something that MATTERS and you cannot reasonably fill it with a sensible default. The configuration state given below is ground truth for the agent's name and qualification criteria — trust it over your reading of the transcript.

Three facts are load-bearing, and NONE has an acceptable default — you must never invent, guess, or fill one in yourself. Flag needsClarification when one is absent from ALL of {the current message, any earlier turn, the configuration state below} — and a fact the user supplied when answering a question you asked earlier counts as present, so never re-ask for it:
1. The product/company/business the agent is selling or representing — without it the agent has no goal, persona, or qualification criteria to stand on. (This never appears in the configuration state, so it must come from the conversation.)
2. The agent's own name — it needs something to call itself when it greets a lead.
3. What makes a lead qualified — there is no reasonable default for who counts as a good lead. (Once the configuration already has criteria, an unrelated edit does NOT re-litigate qualification.)

Also flag needsClarification when the user sets a NEW quantitative qualification threshold whose unit or time period is ambiguous and materially changes what the criterion means, with no reasonable default — e.g. "budget over $100" (per month? per year? total?) or a bare duration/frequency ("contract length over 6" — months? years?). This holds even when other criteria already exist: it's about THIS threshold being ambiguous, not whether qualification exists. Do NOT flag thresholds whose unit is self-evident ("team size ≥ 10" is a plain head count; "budget over $100k/year" already states the period).

For "question", "test_call", and "chitchat" routes, needsClarification is always false.`;

export async function routerNode(state: BuilderState): Promise<Partial<BuilderState>> {
  const spec = state.workingSpec;
  const specNote = `Configuration state (ground truth — may already satisfy a gap even if the conversation text doesn't spell it out): agent name is ${spec.identity.name ? `set ("${spec.identity.name}")` : "NOT set"}; qualification criteria: ${spec.qualification.criteria.length > 0 ? `${spec.qualification.criteria.length} defined` : "NONE defined"}.`;
  const resp = await getAnthropic().messages.parse({
    model: env.builderModel(),
    max_tokens: 300,
    system: `${SYSTEM}\n\n${specNote}`,
    messages: historyToMessages(state.history, state.userMessage),
    output_config: { format: zodOutputFormat(RouteSchema) },
  });
  const route: Route = resp.parsed_output?.route ?? "chitchat";
  const needsClarification = route === "edit" && (resp.parsed_output?.needsClarification ?? false);
  return { route, needsClarification, routeReason: resp.parsed_output?.reason };
}
