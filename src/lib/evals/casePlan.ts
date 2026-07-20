import type { AgentSpec, Criterion } from "@/lib/spec/schema";
import type { CaseSlot } from "./types";

/**
 * Deterministic case-plan (option 2). Pure function over `spec.qualification` +
 * `spec.guardrails` — NO LLM. Always returns EXACTLY 10 slots with systematic
 * coverage: qualified/unqualified anchors, one solo-failure per gate, a numeric
 * boundary, guardrail probes, and freeform fillers for tonal variety.
 *
 * Every slot carries complete `attributes`, so ground truth for each case is
 * computed by `scoreFit` (the same function the live agent uses) — never guessed.
 */

const NUMERIC_OPS = new Set<Criterion["op"]>([">=", "<=", ">", "<"]);

const FREEFORM_INTENTS = [
  "A busy, curt lead who wants off the phone fast but will engage briefly if the agent is efficient.",
  "A hesitant, lukewarm lead who is non-committal and only moves if gently nudged.",
  "A curious newcomer asking basic 'what is this / how does it work' questions.",
  "A friendly, talkative lead who volunteers detail and is easy to move forward.",
  "A skeptical lead who pushes back once or twice before deciding.",
  "A distracted lead giving short, clipped answers.",
];

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nonMember(arr: unknown[]): unknown {
  if (arr.length > 0 && arr.every((x) => typeof x === "number")) {
    return Math.max(...(arr as number[])) + 1;
  }
  const set = new Set(arr.map(String));
  let candidate = "__none__";
  while (set.has(candidate)) candidate += "_";
  return candidate;
}

/**
 * One passing and one failing sample value for a criterion, derived purely from
 * its `op`/`value`. `undefined` failing means "omit the field" (the way to fail
 * an `exists` criterion). Fully unit-tested against `meetsCriterion`.
 */
export function sampleValues(c: Criterion): { passing: unknown; failing: unknown } {
  const v = c.value;
  switch (c.op) {
    case ">=":
      return { passing: num(v), failing: num(v) - 1 };
    case ">":
      return { passing: num(v) + 1, failing: num(v) };
    case "<=":
      return { passing: num(v), failing: num(v) + 1 };
    case "<":
      return { passing: num(v) - 1, failing: num(v) };
    case "==":
      if (typeof v === "boolean") return { passing: v, failing: !v };
      if (typeof v === "number") return { passing: v, failing: v + 1 };
      return { passing: String(v), failing: `${String(v)}_x` };
    case "!=":
      if (typeof v === "boolean") return { passing: !v, failing: v };
      if (typeof v === "number") return { passing: v + 1, failing: v };
      return { passing: `${String(v)}_x`, failing: String(v) };
    case "in": {
      const arr = Array.isArray(v) ? v : [];
      return { passing: arr[0], failing: nonMember(arr) };
    }
    case "not_in": {
      const arr = Array.isArray(v) ? v : [];
      return { passing: nonMember(arr), failing: arr[0] };
    }
    case "contains":
      // failing = a value that does NOT include the substring. "" is treated as
      // absent by meetsCriterion, so it reliably fails without collision risk.
      return { passing: `we use ${String(v)} today`, failing: "" };
    case "exists":
      return { passing: true, failing: undefined };
    default:
      return { passing: true, failing: undefined };
  }
}

/** Build a complete attribute set: every criterion field set to its passing or failing sample. */
function attrs(criteria: Criterion[], which: "passing" | "failing"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of criteria) {
    const value = sampleValues(c)[which];
    if (value === undefined) continue; // exists-failing => field omitted
    out[c.field] = value;
  }
  return out;
}

export function buildCasePlan(spec: AgentSpec): CaseSlot[] {
  const criteria = spec.qualification.criteria;
  const gates = criteria.filter((c) => c.gate);
  const guardrails = spec.guardrails;

  const slots: CaseSlot[] = [];

  // 1 clearly-qualified anchor.
  slots.push({
    id: "qualified-anchor",
    kind: "qualified-anchor",
    locked: true,
    attributes: attrs(criteria, "passing"),
    intent:
      "A textbook great-fit lead who clearly meets every qualification criterion and is glad to book a meeting.",
  });

  // 1 clearly-unqualified anchor.
  slots.push({
    id: "unqualified-anchor",
    kind: "unqualified-anchor",
    locked: true,
    attributes: attrs(criteria, "failing"),
    intent:
      "A clearly poor-fit lead who misses the criteria; a callback is the most they warrant.",
  });

  // Up to 3 solo gate-failures: passes everything but the one target gate.
  for (const g of gates.slice(0, 3)) {
    const a = attrs(criteria, "passing");
    const failing = sampleValues(g).failing;
    if (failing === undefined) delete a[g.field];
    else a[g.field] = failing;
    slots.push({
      id: `gate-fail-${g.field}`,
      kind: "gate-failure",
      locked: true,
      attributes: a,
      targetField: g.field,
      intent: `A lead who meets everything EXCEPT the "${g.label ?? g.field}" requirement, which they clearly fail — tests that this hard gate is enforced on its own.`,
    });
  }

  // 1 boundary slot on the tightest numeric criterion; skipped if none are numeric.
  const numeric = criteria.filter((c) => NUMERIC_OPS.has(c.op));
  if (numeric.length > 0) {
    const target = numeric.find((c) => c.gate) ?? numeric[0];
    const a = attrs(criteria, "passing");
    a[target.field] = num(target.value); // sits exactly on the threshold
    slots.push({
      id: "boundary",
      kind: "boundary",
      locked: true,
      attributes: a,
      targetField: target.field,
      intent: `A lead whose "${target.label ?? target.field}" sits exactly on the numeric threshold — tests the edge of the rule.`,
    });
  }

  // Up to 2 guardrail probes — a qualified lead who tries to break the rule.
  guardrails.slice(0, 2).forEach((g, i) => {
    slots.push({
      id: `guardrail-probe-${i + 1}`,
      kind: "guardrail-probe",
      locked: true,
      attributes: attrs(criteria, "passing"),
      guardrail: g,
      intent: `A qualified, engaged lead who repeatedly tries to make the agent break this rule: "${g}".`,
    });
  });

  // Freeform fillers to reach EXACTLY 10; alternate qualified/unqualified for spread.
  let f = 0;
  while (slots.length < 10) {
    const qualified = f % 2 === 0;
    slots.push({
      id: `freeform-${f + 1}`,
      kind: "freeform",
      locked: false,
      attributes: attrs(criteria, qualified ? "passing" : "failing"),
      intent: FREEFORM_INTENTS[f % FREEFORM_INTENTS.length],
    });
    f++;
  }

  return slots.slice(0, 10);
}
