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
- "edit": they want to create or change the agent's config (identity, goal, qualification criteria, tools, guardrails). e.g. "make her friendlier", "qualify on team size ≥ 10", "add a callback tool".
- "question": they're asking about the current agent/spec. e.g. "what criteria does it use?", "show the prompt".
- "test_call": they want to place/test a call. e.g. "call lead 3", "test it on Jordan".
- "chitchat": greetings or anything else.
Prefer "edit" when they express a desired change to the agent. If the assistant's previous message asked a clarifying question and the user's latest message answers it (e.g. provides the criteria that were requested), classify as "edit".

For "edit" routes only, also decide needsClarification: true ONLY when the request is underspecified on something that MATTERS and you cannot reasonably fill it with a sensible default (e.g. "qualify leads" with no criteria given). One thing that always matters: what product/company/business the agent is selling or representing. If neither the current message nor any earlier turn in this conversation has established that, needsClarification is true — the agent can't have a goal, persona, or qualification criteria in a vacuum. If earlier in this conversation you already asked a clarifying question and the user's latest message answers it, needsClarification is false — proceed with what they told you. For "question", "test_call", and "chitchat" routes, needsClarification is always false.`;

export async function routerNode(state: BuilderState): Promise<Partial<BuilderState>> {
  const resp = await getAnthropic().messages.parse({
    model: env.builderModel(),
    max_tokens: 300,
    system: SYSTEM,
    messages: historyToMessages(state.history, state.userMessage),
    output_config: { format: zodOutputFormat(RouteSchema) },
  });
  const route: Route = resp.parsed_output?.route ?? "chitchat";
  const needsClarification = route === "edit" && (resp.parsed_output?.needsClarification ?? false);
  return { route, needsClarification, routeReason: resp.parsed_output?.reason };
}
