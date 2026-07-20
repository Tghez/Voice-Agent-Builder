import type { AgentSpec } from "@/lib/spec/schema";

/**
 * Spec diff for the responder + chat UI: what changed between the previous spec
 * version and the new one. Pure and deterministic.
 */

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface SpecDiff {
  changes: FieldChange[];
  /** Human-readable one-liners for the chat summary. */
  summary: string[];
}

/**
 * Stable, key-order-insensitive stringify. The DB returns jsonb with arbitrary
 * key order, so a plain JSON.stringify would false-positive a "change" when
 * comparing a loaded spec against a freshly-parsed one. Also reused as the
 * canonical hash key for persona golden-sets (see evals/personaGen.ts).
 */
export function stableStringify(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v, (_, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.keys(val)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = (val as Record<string, unknown>)[k];
            return acc;
          }, {})
      : val,
  );
}

export function diffSpecs(before: AgentSpec | null, after: AgentSpec): SpecDiff {
  const changes: FieldChange[] = [];
  const summary: string[] = [];

  if (!before) {
    summary.push(`Created agent "${after.identity.name}".`);
    return { changes, summary };
  }

  const cmp = (path: string, b: unknown, a: unknown, label: string) => {
    if (stableStringify(b) !== stableStringify(a)) {
      changes.push({ path, before: b, after: a });
      summary.push(label);
    }
  };

  cmp("identity.name", before.identity.name, after.identity.name, `Renamed to "${after.identity.name}".`);
  cmp("identity.persona", before.identity.persona, after.identity.persona, "Updated persona.");
  cmp("identity.voice", before.identity.voice, after.identity.voice, `Voice → ${after.identity.voice}.`);
  cmp("identity.firstMessage", before.identity.firstMessage, after.identity.firstMessage, "Updated first message.");
  cmp("goal", before.goal, after.goal, "Updated goal.");

  if (stableStringify(before.qualification) !== stableStringify(after.qualification)) {
    changes.push({ path: "qualification", before: before.qualification, after: after.qualification });
    const bc = before.qualification.criteria.length;
    const ac = after.qualification.criteria.length;
    summary.push(
      bc !== ac
        ? `Qualification: ${bc} → ${ac} criteria (pass ${after.qualification.scoring.passScore}).`
        : `Adjusted qualification (pass ${after.qualification.scoring.passScore}).`,
    );
  }

  if (stableStringify(before.actions) !== stableStringify(after.actions)) {
    changes.push({ path: "actions", before: before.actions, after: after.actions });
    summary.push(`Tools: ${after.actions.join(", ") || "(none)"}.`);
  }

  if (stableStringify(before.guardrails) !== stableStringify(after.guardrails)) {
    changes.push({ path: "guardrails", before: before.guardrails, after: after.guardrails });
    summary.push(`Guardrails: ${after.guardrails.length} rule(s).`);
  }

  if (summary.length === 0) summary.push("No changes.");
  return { changes, summary };
}
