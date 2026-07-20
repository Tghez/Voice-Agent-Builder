import { describe, it, expect } from "vitest";
import { buildCasePlan, sampleValues } from "@/lib/evals/casePlan";
import { scoreFit, meetsCriterion } from "@/lib/scoring/fit";
import { emptySpec, type AgentSpec, type Criterion, type CriterionOp } from "@/lib/spec/schema";

function crit(p: Partial<Criterion> & Pick<Criterion, "field" | "op" | "value">): Criterion {
  return { weight: 1, gate: false, ...p };
}

function specWith(criteria: Criterion[], guardrails: string[] = []): AgentSpec {
  return {
    ...emptySpec(),
    goal: "Sell the thing",
    qualification: { criteria, scoring: { mode: "weighted", passScore: 60 } },
    guardrails,
  };
}

const gate = (field: string, op: CriterionOp, value: Criterion["value"]) =>
  crit({ field, op, value, gate: true });

describe("sampleValues", () => {
  const ops: { c: Criterion }[] = [
    { c: crit({ field: "n", op: ">=", value: 10 }) },
    { c: crit({ field: "n", op: ">", value: 10 }) },
    { c: crit({ field: "n", op: "<=", value: 10 }) },
    { c: crit({ field: "n", op: "<", value: 10 }) },
    { c: crit({ field: "b", op: "==", value: true }) },
    { c: crit({ field: "s", op: "==", value: "smb" }) },
    { c: crit({ field: "m", op: "==", value: 3 }) },
    { c: crit({ field: "b", op: "!=", value: false }) },
    { c: crit({ field: "s", op: "!=", value: "x" }) },
    { c: crit({ field: "r", op: "in", value: ["us", "eu"] }) },
    { c: crit({ field: "r", op: "not_in", value: ["us", "eu"] }) },
    { c: crit({ field: "t", op: "contains", value: "CRM" }) },
    { c: crit({ field: "e", op: "exists", value: true }) },
    { c: crit({ field: "nums", op: "in", value: [1, 2, 3] }) },
  ];

  it("passing sample meets, failing sample does not — for every op", () => {
    for (const { c } of ops) {
      const { passing, failing } = sampleValues(c);
      expect(meetsCriterion(c, passing), `${c.op} passing`).toBe(true);
      // failing may be `undefined` (omitted field) which is correctly "not met".
      expect(meetsCriterion(c, failing), `${c.op} failing`).toBe(false);
    }
  });

  it("exists failing is undefined (omit the field)", () => {
    expect(sampleValues(crit({ field: "e", op: "exists", value: true })).failing).toBeUndefined();
  });
});

describe("buildCasePlan", () => {
  const numericGates = [
    gate("team_size", ">=", 10),
    gate("spend", ">=", 5000),
    crit({ field: "attribution", op: "==", value: "yes", weight: 2 }),
    crit({ field: "owns_budget", op: "==", value: true, gate: true }),
  ];

  it("always returns exactly 10 slots (0, 1, 4+ gates × 0, 1, 3+ guardrails)", () => {
    const gateCounts: Criterion[][] = [
      [],
      [gate("g0", ">=", 1)],
      [gate("g0", ">=", 1), gate("g1", ">=", 2), gate("g2", ">=", 3), gate("g3", ">=", 4)],
    ];
    const guardrailSets = [[], ["never quote a price"], ["a", "b", "c"]];
    for (const gs of gateCounts) {
      for (const grs of guardrailSets) {
        const plan = buildCasePlan(specWith([...gs, crit({ field: "w", op: "==", value: true })], grs));
        expect(plan).toHaveLength(10);
      }
    }
  });

  it("empty spec still yields exactly 10 slots", () => {
    expect(buildCasePlan(emptySpec())).toHaveLength(10);
  });

  it("the qualified anchor scoreFit()s true and the unqualified anchor false", () => {
    const spec = specWith(numericGates);
    const plan = buildCasePlan(spec);
    const qual = plan.find((s) => s.kind === "qualified-anchor")!;
    const unq = plan.find((s) => s.kind === "unqualified-anchor")!;
    expect(scoreFit(spec.qualification, qual.attributes).qualified).toBe(true);
    expect(scoreFit(spec.qualification, unq.attributes).qualified).toBe(false);
  });

  it("each gate-failure slot fails ONLY its target gate", () => {
    const spec = specWith(numericGates);
    const plan = buildCasePlan(spec);
    const gateSlots = plan.filter((s) => s.kind === "gate-failure");
    expect(gateSlots.length).toBe(3); // capped at 3 (there are 3 gates here)
    for (const slot of gateSlots) {
      const fit = scoreFit(spec.qualification, slot.attributes);
      expect(fit.qualified).toBe(false);
      const failedGates = fit.criteria.filter((c) => c.gate && !c.met).map((c) => c.field);
      expect(failedGates).toEqual([slot.targetField]);
    }
  });

  it("includes a boundary slot when a numeric criterion exists, and none when all boolean/categorical", () => {
    const withNumeric = buildCasePlan(specWith(numericGates));
    expect(withNumeric.some((s) => s.kind === "boundary")).toBe(true);

    const allBool = buildCasePlan(
      specWith([crit({ field: "a", op: "==", value: true }), crit({ field: "b", op: "==", value: false })]),
    );
    expect(allBool.some((s) => s.kind === "boundary")).toBe(false);
    expect(allBool).toHaveLength(10);
  });

  it("caps guardrail probes at 2, one per guardrail", () => {
    const plan = buildCasePlan(specWith(numericGates, ["r1", "r2", "r3", "r4"]));
    const probes = plan.filter((s) => s.kind === "guardrail-probe");
    expect(probes).toHaveLength(2);
    expect(probes.map((p) => p.guardrail)).toEqual(["r1", "r2"]);
  });

  it("every non-omitting slot's attributes cover every criterion field (no exists criteria)", () => {
    const spec = specWith(numericGates); // no exists ops → completeness holds everywhere
    const fields = spec.qualification.criteria.map((c) => c.field);
    for (const slot of buildCasePlan(spec)) {
      // unqualified anchor + odd freeform fail via wrong VALUES here (no exists → no omission)
      for (const f of fields) {
        expect(Object.prototype.hasOwnProperty.call(slot.attributes, f), `${slot.id} missing ${f}`).toBe(true);
      }
    }
  });
});
