/** Central config. Model ids and base URL, overridable via env. */

// In-call model id is passed to VAPI's anthropic provider, whose accepted enum
// requires the DATED snapshot (bare "claude-haiku-4-5" is rejected with a 400).
export const INCALL_MODEL = process.env.INCALL_MODEL ?? "claude-haiku-4-5-20251001";
// Builder/judge model goes to the Anthropic SDK directly — keep the bare alias.
export const BUILDER_MODEL = process.env.BUILDER_MODEL ?? "claude-sonnet-5";

/** Public base URL used for Vapi webhook `server.url` values. */
export function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}
