import { z } from "zod";

/**
 * AgentSpec — the canonical, versioned artifact that the builder produces and
 * the compiler consumes. This file is the single source of the shared
 * vocabulary: the compiler, `qualify_lead`, the builder tools, and the evals
 * all speak these types. Nothing here knows about Vapi.
 */

/** Comparison operators a qualification criterion can use. */
export const CriterionOp = z.enum([
  ">=",
  "<=",
  "==",
  "!=",
  ">",
  "<",
  "in",
  "not_in",
  "contains",
  "exists",
]);
export type CriterionOp = z.infer<typeof CriterionOp>;

/** A value a criterion can compare against. */
export const CriterionValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
]);
export type CriterionValue = z.infer<typeof CriterionValue>;

/**
 * A single qualification rule. `field` references the lead/answer vocabulary
 * shared with `qualify_lead` (e.g. "team_size", "budget", "has_authority").
 * `gate: true` makes it a hard requirement (fail => not qualified, always).
 * `weight` feeds the weighted score for non-gate criteria.
 */
export const CriterionSchema = z.object({
  field: z.string().min(1),
  op: CriterionOp,
  value: CriterionValue,
  weight: z.number().min(0).default(1),
  gate: z.boolean().default(false),
  /** Human phrasing rendered into the runtime prompt + used by the judge. */
  label: z.string().optional(),
});
export type Criterion = z.infer<typeof CriterionSchema>;

/**
 * How the deterministic Track-1 fit score turns criteria into a verdict.
 * `passScore` is the weighted threshold (0–100); gates are always enforced.
 */
export const ScoringSchema = z.object({
  mode: z.enum(["weighted", "all", "any"]).default("weighted"),
  passScore: z.number().min(0).max(100).default(60),
});
export type Scoring = z.infer<typeof ScoringSchema>;

/** Voice options; the compiler (and only the compiler) maps these to Cartesia voiceIds. */
export const VoiceSchema = z.enum([
  "friendly-female",
  "friendly-male",
  "professional-female",
  "professional-male",
]);
export type Voice = z.infer<typeof VoiceSchema>;

/** Runtime tools the voice agent may be granted. Matches handlers in /api/vapi/tools. */
export const RuntimeToolSchema = z.enum([
  "qualify_lead",
  "check_availability",
  "book_meeting",
  "schedule_callback",
]);
export type RuntimeTool = z.infer<typeof RuntimeToolSchema>;

export const IdentitySchema = z.object({
  name: z.string().min(1),
  persona: z.string(),
  voice: VoiceSchema,
  firstMessage: z.string(),
});
export type Identity = z.infer<typeof IdentitySchema>;

export const QualificationSchema = z.object({
  criteria: z.array(CriterionSchema),
  scoring: ScoringSchema,
});
export type Qualification = z.infer<typeof QualificationSchema>;

export const AgentSpecSchema = z.object({
  identity: IdentitySchema,
  goal: z.string(),
  qualification: QualificationSchema,
  /** Subset of runtime tool names the voice agent gets. */
  actions: z.array(RuntimeToolSchema),
  guardrails: z.array(z.string()),
  /** Set by the compiler after the first POST /assistant. */
  vapiAssistantId: z.string().optional(),
  version: z.number().int().nonnegative(),
});
export type AgentSpec = z.infer<typeof AgentSpecSchema>;

/**
 * A minimal valid starting spec. The builder mutates this via pure tools; the
 * compiler will reject it at parse time only if a later edit makes it invalid.
 */
export function emptySpec(): AgentSpec {
  return {
    identity: {
      name: "Maya",
      persona: "A warm, concise sales development rep.",
      voice: "friendly-female",
      firstMessage: "Hi, this is Maya — do you have a quick minute?",
    },
    goal: "",
    qualification: {
      criteria: [],
      scoring: { mode: "weighted", passScore: 60 },
    },
    actions: [],
    guardrails: [],
    version: 0,
  };
}
