import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

/** Shared Anthropic client for the builder graph, eval judge, and Track-2 intent. */
let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicKey() });
  return _client;
}
