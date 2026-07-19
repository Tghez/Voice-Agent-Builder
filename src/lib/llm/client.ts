import Anthropic from "@anthropic-ai/sdk";
import { wrapAnthropic } from "langsmith/wrappers/anthropic";
import { env } from "@/lib/env";

/**
 * Shared Anthropic client for the builder graph, eval judge, and Track-2 intent.
 * Wrapped with LangSmith so every messages.create/parse call is traced — nested
 * under the current LangGraph node's run when called inside builderGraph.invoke(),
 * standalone otherwise (evals, scripts). No-op when LANGSMITH_TRACING is unset.
 */
let _client: ReturnType<typeof wrapAnthropic<Anthropic>> | null = null;

export function getAnthropic() {
  if (!_client) _client = wrapAnthropic(new Anthropic({ apiKey: env.anthropicKey() }));
  return _client;
}
