import { emptySpec, type AgentSpec } from "@/lib/spec/schema";
import type { ChatTurn, Route } from "@/lib/builder/state";

/**
 * Tier-1 builder-eval case set. Two tracks, both with OBJECTIVE ground truth
 * (no LLM judge):
 *
 *   1. router  — classify the turn + decide needsClarification. Gold labels are
 *      hand-authored; we assert the router's structured decision against them.
 *   2. edit    — a single NL instruction against a known spec. We assert on the
 *      deterministic `diffSpecs`: the intended field(s) MUST change and the
 *      load-bearing rest MUST NOT (invariant #3: surgical edits, no blind
 *      overwrite).
 *
 * `spec` names a fixture; the runner instantiates a FRESH copy per case (the
 * editor mutates the working spec in place).
 */

/** A realistic, already-configured agent — the fixture edit cases diff against. */
export function configuredSpec(): AgentSpec {
  return {
    identity: {
      name: "Maya",
      persona: "A warm, professional sales development rep for Acme Analytics.",
      voice: "friendly-female",
      firstMessage: "Hi, this is Maya from Acme Analytics — do you have a quick minute?",
    },
    goal: "Qualify the lead and book a 30-minute demo if they're a good fit, otherwise schedule a callback.",
    qualification: {
      criteria: [
        { field: "team_size", op: ">=", value: 10, weight: 1, gate: true, label: "sales team of at least 10" },
        { field: "budget_approved", op: "==", value: true, weight: 1, gate: false, label: "budget approved this quarter" },
      ],
      scoring: { mode: "weighted", passScore: 60 },
    },
    actions: ["qualify_lead", "check_availability", "book_meeting", "schedule_callback"],
    guardrails: ["Never quote specific pricing."],
  };
}

export type FixtureName = "empty" | "configured";

export function fixture(name: FixtureName): AgentSpec {
  return name === "configured" ? configuredSpec() : emptySpec();
}

export interface RouterCase {
  kind: "router";
  id: string;
  message: string;
  history?: ChatTurn[];
  spec: FixtureName;
  expectRoute: Route;
  /** Only asserted for edit routes (undefined = don't check). */
  expectClarify?: boolean;
  note: string;
}

export interface EditCase {
  kind: "edit";
  id: string;
  message: string;
  history?: ChatTurn[];
  spec: FixtureName;
  /** diffSpecs paths that MUST appear in the diff. */
  mustChange: string[];
  /** diffSpecs paths that MUST NOT appear in the diff. */
  mustNotChange: string[];
  note: string;
}

export type BuilderEvalCase = RouterCase | EditCase;

// ── Router track ─────────────────────────────────────────────────────────────
export const ROUTER_CASES: RouterCase[] = [
  {
    kind: "router",
    id: "router-create-full",
    message:
      "Create an agent named Maya for Acme Analytics. Qualify leads with a sales team of at least 10 and budget approved this quarter.",
    spec: "empty",
    expectRoute: "edit",
    expectClarify: false,
    note: "Fully-specified create (name + business + criteria) → edit, no clarification.",
  },
  {
    kind: "router",
    id: "router-vague-qualify",
    message: "Set up qualification for my leads.",
    spec: "empty",
    expectRoute: "edit",
    expectClarify: true,
    note: "Asks to qualify but gives no criteria on a fresh agent → must clarify (no default for who qualifies).",
  },
  {
    kind: "router",
    id: "router-vague-create",
    message: "Build me a sales agent.",
    spec: "empty",
    expectRoute: "edit",
    expectClarify: true,
    note: "No name, business, or criteria → must clarify (none may be invented).",
  },
  {
    kind: "router",
    id: "router-ambiguous-threshold",
    message: "Also qualify leads by budget over 100.",
    spec: "configured",
    expectRoute: "edit",
    expectClarify: true,
    note: "New numeric threshold with ambiguous unit/period ($100 per month? year? total?) → must clarify.",
  },
  {
    kind: "router",
    id: "router-selfevident-threshold",
    message: "Also qualify on a sales team of at least 25.",
    spec: "configured",
    expectRoute: "edit",
    expectClarify: false,
    note: "Self-evident head-count threshold (paired A/B with router-ambiguous-threshold, same fixture) → edit, no clarification.",
  },
  {
    kind: "router",
    id: "router-stated-period",
    message: "Add a criterion for budget over $100k per year.",
    spec: "configured",
    expectRoute: "edit",
    expectClarify: false,
    note: "Threshold with an explicit period → edit, no clarification.",
  },
  {
    kind: "router",
    id: "router-friendlier",
    message: "Make her a bit friendlier on the call.",
    spec: "configured",
    expectRoute: "edit",
    expectClarify: false,
    note: "Tone tweak on a configured agent → edit, no clarification.",
  },
  {
    kind: "router",
    id: "router-guardrail",
    message: "Never quote specific pricing.",
    spec: "configured",
    expectRoute: "edit",
    expectClarify: false,
    note: "Adding a guardrail → edit, no clarification.",
  },
  {
    kind: "router",
    id: "router-memory-answer",
    message: "Team size of at least 10 and budget approved this quarter.",
    history: [
      { role: "user", content: "Create an agent named Maya for Acme Analytics to qualify and book leads." },
      { role: "assistant", content: "Great — what makes a lead qualified? For example, a minimum team size or an approved budget?" },
    ],
    spec: "empty",
    expectRoute: "edit",
    expectClarify: false,
    note: "Session memory: name + business were already given, so answering the clarifier's own criteria question must NOT re-ask.",
  },
  {
    kind: "router",
    id: "router-question-criteria",
    message: "What criteria does it use to qualify leads?",
    spec: "configured",
    expectRoute: "question",
    note: "Asking about current config → question.",
  },
  {
    kind: "router",
    id: "router-question-prompt",
    message: "Show me the compiled prompt.",
    spec: "configured",
    expectRoute: "question",
    note: "Asking to see the prompt → question.",
  },
  {
    kind: "router",
    id: "router-testcall-lead",
    message: "Call lead 3 and test it.",
    spec: "configured",
    expectRoute: "test_call",
    note: "Requesting a test call → test_call.",
  },
  {
    kind: "router",
    id: "router-testcall-name",
    message: "Test it on Jordan.",
    spec: "configured",
    expectRoute: "test_call",
    note: "Requesting a test call by lead name → test_call.",
  },
  {
    kind: "router",
    id: "router-chitchat-greeting",
    message: "hey there!",
    spec: "empty",
    expectRoute: "chitchat",
    note: "Greeting → chitchat.",
  },
  {
    kind: "router",
    id: "router-chitchat-thanks",
    message: "thanks, that's great",
    spec: "configured",
    expectRoute: "chitchat",
    note: "Acknowledgement → chitchat.",
  },
];

// ── Edit track (surgical-ness) ───────────────────────────────────────────────
export const EDIT_CASES: EditCase[] = [
  {
    kind: "edit",
    id: "edit-energetic",
    message: "Make her more energetic and enthusiastic on the call.",
    spec: "configured",
    mustChange: ["identity.persona"],
    mustNotChange: ["qualification", "goal", "guardrails", "identity.name", "actions"],
    note: "Persona tweak must not touch qualification, goal, guardrails, name, or actions.",
  },
  {
    kind: "edit",
    id: "edit-first-message",
    message: 'Change the first message to exactly: "Hi, Maya here from Acme — is now a bad time?"',
    spec: "configured",
    mustChange: ["identity.firstMessage"],
    mustNotChange: ["qualification", "goal", "guardrails", "identity.name", "identity.persona", "actions"],
    note: "Greeting edit is isolated to identity.firstMessage.",
  },
  {
    kind: "edit",
    id: "edit-add-guardrail",
    message: "Add a rule: never promise a specific discount.",
    spec: "configured",
    mustChange: ["guardrails"],
    mustNotChange: ["qualification", "goal", "identity.name", "identity.persona", "actions"],
    note: "New guardrail must not disturb qualification, goal, identity, or actions.",
  },
  {
    kind: "edit",
    id: "edit-pass-score",
    message: "Raise the qualification pass score to 75.",
    spec: "configured",
    mustChange: ["qualification"],
    mustNotChange: ["goal", "guardrails", "identity.name", "identity.persona", "actions"],
    note: "Scoring change is isolated to qualification.",
  },
  {
    kind: "edit",
    id: "edit-add-criterion",
    message: "Also require that their annual budget is at least $50k per year.",
    spec: "configured",
    mustChange: ["qualification"],
    mustNotChange: ["goal", "guardrails", "identity.name", "identity.persona", "actions"],
    note: "Adding a criterion must preserve the existing ones and the rest of the spec.",
  },
  {
    kind: "edit",
    id: "edit-rename",
    message: "Rename her to Sarah.",
    spec: "configured",
    mustChange: ["identity.name"],
    mustNotChange: ["qualification", "goal", "guardrails", "actions"],
    note: "Rename must not rewrite qualification, goal, guardrails, or actions.",
  },
];

export const ALL_CASES: BuilderEvalCase[] = [...ROUTER_CASES, ...EDIT_CASES];
