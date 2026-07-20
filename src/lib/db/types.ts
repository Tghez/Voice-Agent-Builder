import type { AgentSpec } from "@/lib/spec/schema";
import type { FitResult } from "@/lib/scoring/fit";
import type { Persona } from "@/lib/evals/types";

/** Row shapes mirroring supabase/migrations. Kept here so repositories are typed. */

export type CallMode = "test" | "live";

export interface AgentRow {
  id: string;
  name: string;
  spec: AgentSpec;
  vapi_assistant_id: string | null;
  /** Persisted golden persona set (regenerated only on a qualification-relevant spec change). */
  persona_set: Persona[] | null;
  /** Hash of the spec surface the persona_set was generated from (see personaGen). */
  persona_set_spec_hash: string | null;
  created_at: string;
}

/** Track-2 intent (advisory). Null until the post-call LLM pass fills it. */
export interface IntentResult {
  intent_score: number;
  stage: "researching" | "evaluating" | "ready_to_buy";
  urgency: "low" | "medium" | "high";
  signals: string[];
  objections: string[];
}

export interface StructuredOutcome {
  fit?: FitResult;
  intent?: IntentResult | null;
  extracted?: Record<string, unknown>;
  meeting_booked?: boolean;
  meeting?: { startISO: string; label: string; bookingId: string } | null;
  callback_scheduled?: boolean;
}

export interface CallRow {
  id: string;
  agent_id: string | null;
  lead_id: string | null;
  mode: CallMode;
  vapi_call_id: string | null;
  status: string | null;
  transcript: unknown;
  recording_url: string | null;
  duration_sec: number | null;
  cost_usd: number | null;
  structured_outcome: StructuredOutcome | null;
  created_at: string;
}
