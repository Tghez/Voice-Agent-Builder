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

function j(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function diffSpecs(before: AgentSpec | null, after: AgentSpec): SpecDiff {
  const changes: FieldChange[] = [];
  const summary: string[] = [];

  if (!before) {
    summary.push(`Created agent "${after.identity.name}".`);
    return { changes, summary };
  }

  const cmp = (path: string, b: unknown, a: unknown, label: string) => {
    if (j(b) !== j(a)) {
      changes.push({ path, before: b, after: a });
      summary.push(label);
    }
  };

  cmp("identity.name", before.identity.name, after.identity.name, `Renamed to "${after.identity.name}".`);
  cmp("identity.persona", before.identity.persona, after.identity.persona, "Updated persona.");
  cmp("identity.voice", before.identity.voice, after.identity.voice, `Voice → ${after.identity.voice}.`);
  cmp("identity.firstMessage", before.identity.firstMessage, after.identity.firstMessage, "Updated first message.");
  cmp("goal", before.goal, after.goal, "Updated goal.");

  if (j(before.qualification) !== j(after.qualification)) {
    changes.push({ path: "qualification", before: before.qualification, after: after.qualification });
    const bc = before.qualification.criteria.length;
    const ac = after.qualification.criteria.length;
    summary.push(
      bc !== ac
        ? `Qualification: ${bc} → ${ac} criteria (pass ${after.qualification.scoring.passScore}).`
        : `Adjusted qualification (pass ${after.qualification.scoring.passScore}).`,
    );
  }

  if (j(before.actions) !== j(after.actions)) {
    changes.push({ path: "actions", before: before.actions, after: after.actions });
    summary.push(`Tools: ${after.actions.join(", ") || "(none)"}.`);
  }

  if (j(before.guardrails) !== j(after.guardrails)) {
    changes.push({ path: "guardrails", before: before.guardrails, after: after.guardrails });
    summary.push(`Guardrails: ${after.guardrails.length} rule(s).`);
  }

  if (summary.length === 0) summary.push("No changes.");
  return { changes, summary };
}
