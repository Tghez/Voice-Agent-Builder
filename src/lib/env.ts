/**
 * Centralized, typed environment access. One place that knows every env var, so
 * missing config fails loudly with a helpful message instead of surfacing as an
 * opaque runtime error deep in a provider. Optional integrations (Cal.com) return
 * undefined rather than throwing, so the mock fallbacks can kick in.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var ${name} — set it in .env.local`);
  }
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  /** Public base URL for Vapi webhook server.url values. */
  baseUrl: (): string => process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",

  // Anthropic — builder graph + eval judge (SDK, bare alias) and in-call (Vapi, dated snapshot).
  anthropicKey: (): string => required("ANTHROPIC_API_KEY"),
  builderModel: (): string => process.env.BUILDER_MODEL ?? "claude-sonnet-5",
  incallModel: (): string => process.env.INCALL_MODEL ?? "claude-haiku-4-5-20251001",
  /** Bare Haiku alias for direct SDK calls (text-mode evals mirror the voice agent). */
  incallModelSdk: (): string => process.env.INCALL_MODEL_SDK ?? "claude-haiku-4-5",

  // Vapi
  vapiKey: (): string => required("VAPI_API_KEY"),
  vapiPhoneNumberId: (): string => required("VAPI_PHONE_NUMBER_ID"),
  /** Client-side key for the Vapi Web SDK (browser calls) — safe to expose. */
  vapiPublicKey: (): string => required("NEXT_PUBLIC_VAPI_PUBLIC_KEY"),

  // Supabase
  supabaseUrl: (): string => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: (): string => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: (): string => required("SUPABASE_SERVICE_ROLE_KEY"),

  // Cal.com — optional; mock fallback used when unset.
  calcomKey: (): string | undefined => optional("CALCOM_API_KEY"),
  calcomEventTypeId: (): string | undefined => optional("CALCOM_EVENT_TYPE_ID"),

  /** Demo phone every lead routes to (never dials a real prospect). */
  demoPhone: (): string => process.env.DEMO_PHONE ?? "+10000000000",

  /**
   * Real, deliverable email every Cal.com booking's attendee routes to (never
   * used elsewhere — lead.email stays the seeded, cosmetic value everywhere
   * except the actual booking call). Seed leads use reserved-TLD `.example`
   * addresses on purpose (never real mail); Cal.com validates deliverability
   * and rejects those with a 400, so a real booking needs a real inbox.
   */
  demoEmail: (): string | undefined => optional("DEMO_EMAIL"),
} as const;
