/** Central config. Model ids and base URL, overridable via env. */

export const INCALL_MODEL = process.env.INCALL_MODEL ?? "claude-haiku-4-5";
export const BUILDER_MODEL = process.env.BUILDER_MODEL ?? "claude-sonnet-5";

/** Public base URL used for Vapi webhook `server.url` values. */
export function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}
