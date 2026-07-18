import type { AgentSpec } from "@/lib/spec/schema";
import type { FitResult } from "@/lib/scoring/fit";

/** Row shapes mirroring supabase/migrations. Kept here so repositories are typed. */

export type CallMode = "test" | "live";

export interface AgentRow {
  id: string;
  name: string;
  current_version: number;
  vapi_assistant_id: string | null;
  created_at: string;
}

export interface AgentSpecRow {
  id: string;
  agent_id: string;
  version: number;
  spec: AgentSpec;
  vapi_assistant_id: string | null;
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
