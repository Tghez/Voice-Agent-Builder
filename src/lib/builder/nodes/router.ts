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
  reason: z.string(),
});

const SYSTEM = `You route messages sent to a builder that creates/edits a voice sales agent via natural language. Classify the user's latest message:
- "edit": they want to create or change the agent's config (identity, goal, qualification criteria, tools, guardrails). e.g. "make her friendlier", "qualify on team size ≥ 10", "add a callback tool".
- "question": they're asking about the current agent/spec. e.g. "what criteria does it use?", "show the prompt".
- "test_call": they want to place/test a call. e.g. "call lead 3", "test it on Jordan".
- "chitchat": greetings or anything else.
Prefer "edit" when they express a desired change to the agent. If the assistant's previous message asked a clarifying question and the user's latest message answers it (e.g. provides the criteria that were requested), classify as "edit".`;

export async function routerNode(state: BuilderState): Promise<Partial<BuilderState>> {
  const resp = await getAnthropic().messages.parse({
    model: env.builderModel(),
    max_tokens: 300,
    system: SYSTEM,
    messages: historyToMessages(state.history, state.userMessage),
    output_config: { format: zodOutputFormat(RouteSchema) },
  });
  const route: Route = resp.parsed_output?.route ?? "chitchat";
  return { route };
}
