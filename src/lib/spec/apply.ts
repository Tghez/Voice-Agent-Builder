import { z } from "zod";
import {
  type AgentSpec,
  CriterionSchema,
  IdentitySchema,
  RuntimeToolSchema,
  ScoringSchema,
} from "./schema";

/**
 * The builder's pure tools. `applyToSpec` is a dumb switch: it writes args into
 * the right spec section with targeted per-field validation, and returns either
 * the updated section or a structured error so the model can self-correct on the
 * next step. NO LLM, NO external I/O here.
 *
 * `get_current_spec` is a READ and is handled by the editor node, not here.
 */

export type BuilderToolName =
  | "configure_identity"
  | "configure_qualification"
  | "configure_actions"
  | "set_goal"
  | "set_guardrails";

export type SpecSection =
  | "identity"
  | "qualification"
  | "actions"
  | "goal"
  | "guardrails";

export interface BuilderToolCall {
  name: BuilderToolName;
  args: unknown;
}

export type ApplyResult =
  | { ok: true; section: SpecSection; value: unknown }
  | { ok: false; error: string };

// ── Per-tool argument schemas (targeted validation) ──────────────────────────
const ConfigureIdentityArgs = IdentitySchema.partial().refine(
  (o) => Object.keys(o).length > 0,
  { message: "provide at least one identity field" },
);
const ConfigureQualificationArgs = z.object({
  criteria: z.array(CriterionSchema),
  scoring: ScoringSchema.partial().optional(),
});
const ConfigureActionsArgs = z.object({ tools: z.array(RuntimeToolSchema) });
const SetGoalArgs = z.object({ goal: z.string() });
const SetGuardrailsArgs = z.object({ guardrails: z.array(z.string()) });

function formatError(e: z.ZodError): string {
  return e.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * Apply one builder tool call to the working spec, mutating it in place.
 * Returns the updated section on success or an error string on validation
 * failure (spec is left unchanged on failure).
 */
export function applyToSpec(
  spec: AgentSpec,
  call: BuilderToolCall,
): ApplyResult {
  switch (call.name) {
    case "configure_identity": {
      const parsed = ConfigureIdentityArgs.safeParse(call.args);
      if (!parsed.success) return { ok: false, error: formatError(parsed.error) };
      spec.identity = { ...spec.identity, ...parsed.data };
      return { ok: true, section: "identity", value: spec.identity };
    }
    case "configure_qualification": {
      const parsed = ConfigureQualificationArgs.safeParse(call.args);
      if (!parsed.success) return { ok: false, error: formatError(parsed.error) };
      spec.qualification.criteria = parsed.data.criteria;
      if (parsed.data.scoring) {
        spec.qualification.scoring = {
          ...spec.qualification.scoring,
          ...parsed.data.scoring,
        };
      }
      return { ok: true, section: "qualification", value: spec.qualification };
    }
    case "configure_actions": {
      const parsed = ConfigureActionsArgs.safeParse(call.args);
      if (!parsed.success) return { ok: false, error: formatError(parsed.error) };
      spec.actions = parsed.data.tools;
      return { ok: true, section: "actions", value: spec.actions };
    }
    case "set_goal": {
      const parsed = SetGoalArgs.safeParse(call.args);
      if (!parsed.success) return { ok: false, error: formatError(parsed.error) };
      spec.goal = parsed.data.goal;
      return { ok: true, section: "goal", value: spec.goal };
    }
    case "set_guardrails": {
      const parsed = SetGuardrailsArgs.safeParse(call.args);
      if (!parsed.success) return { ok: false, error: formatError(parsed.error) };
      spec.guardrails = parsed.data.guardrails;
      return { ok: true, section: "guardrails", value: spec.guardrails };
    }
    default: {
      const exhaustive: never = call.name;
      return { ok: false, error: `unknown tool: ${String(exhaustive)}` };
    }
  }
}
