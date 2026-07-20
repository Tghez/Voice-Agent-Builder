import type { FitResult } from "@/lib/scoring/fit";

/**
 * Shared eval vocabulary. Types-only module (no runtime code, no server imports)
 * so the client bundle (`evalRunStore` / the evals page) can import the same
 * shapes the server produces instead of hand-declaring drifting copies. Because
 * every export is a type, this tree-shakes out of any bundle that only does
 * `import type`.
 */

/** A simulated lead. Attributes are GROUND TRUTH — `scoreFit` on them gives the
 * deterministic expected verdict (no LLM guessing). Brief drives the roleplay. */
export interface Persona {
  id: string;
  name: string;
  company: string;
  /** Ground truth the lead reveals truthfully; covers every criterion field. */
  attributes: Record<string, unknown>;
  /** Roleplay instructions for the LLM-as-lead. */
  brief: string;
  /** If set, the lead deliberately probes this guardrail; the judge checks it held. */
  guardrailProbe?: string;
}

export type CaseSlotKind =
  | "qualified-anchor"
  | "unqualified-anchor"
  | "gate-failure"
  | "boundary"
  | "guardrail-probe"
  | "freeform";

/**
 * One planned case, produced deterministically from the spec (no LLM). Every slot
 * carries complete `attributes` (covering every criterion field). `locked` slots
 * keep those attributes verbatim; `freeform` slots may have theirs replaced by the
 * generator's LLM pass for tonal variety.
 */
export interface CaseSlot {
  id: string;
  kind: CaseSlotKind;
  locked: boolean;
  attributes: Record<string, unknown>;
  /** gate-failure: the single field this slot fails. */
  targetField?: string;
  /** guardrail-probe: the guardrail rule the lead tries to break. */
  guardrail?: string;
  /** Hint handed to the persona-prose LLM so the brief matches the slot's role. */
  intent: string;
}

export interface Turn {
  role: "agent" | "lead";
  text: string;
}

/** Per-case scores persisted to `eval_cases.scores`. */
export interface EvalCaseScores {
  /** Deterministic ground truth: scoreFit(spec.qualification, persona.attributes).qualified. */
  expected_qualified: boolean;
  /** The agent's own qualify_lead verdict (null if it never called the tool). */
  agent_qualified: boolean | null;
  fit_score: number | null;
  qualify_correct: boolean;
  action_correct: boolean;
  meeting_booked: boolean;
  callback_scheduled: boolean;
  guardrails_ok: boolean;
  guardrail_probe: string | null;
  /** Full fit breakdown from the agent's own tool call — shown verbatim in the drawer. */
  fit: FitResult | null;
  /** Answers the agent extracted, as recorded by qualify_lead. */
  extracted: Record<string, unknown> | null;
}

export interface CaseResult {
  id: string;
  persona: Persona;
  transcript: Turn[];
  scores: EvalCaseScores;
  passed: boolean;
  judge_notes: string;
}

export interface EvalCaseSummary {
  /** Persona slot label, e.g. "qualified-anchor" (display). */
  id: string;
  /** DB row id of the eval_cases row — used to fetch full detail for the drawer. */
  caseId: string;
  passed: boolean;
  notes: string;
}

export interface EvalSummary {
  runId: string;
  total: number;
  passed: number;
  /** % of cases where the agent's qualify verdict matched ground truth. */
  qualifyRate: number;
  /** % of expected-qualified cases that got booked. */
  bookRate: number;
  guardrailViolations: number;
  cases: EvalCaseSummary[];
}

/** One full case row for the detail drawer (GET /api/evals?caseId=). */
export interface EvalCaseDetail {
  id: string;
  run_id: string;
  persona: Persona | null;
  transcript: Turn[];
  scores: EvalCaseScores;
  passed: boolean;
  judge_notes: string;
  created_at: string;
}
