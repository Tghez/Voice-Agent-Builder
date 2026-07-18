import { describe, it, expect } from "vitest";
import { scoreFit, meetsCriterion } from "@/lib/scoring/fit";
import type { Criterion, Qualification } from "@/lib/spec/schema";

function crit(p: Partial<Criterion> & Pick<Criterion, "field" | "op" | "value">): Criterion {
  return { weight: 1, gate: false, ...p };
}

describe("meetsCriterion", () => {
  it("numeric comparisons, with string coercion", () => {
    expect(meetsCriterion(crit({ field: "n", op: ">=", value: 10 }), 10)).toBe(true);
    expect(meetsCriterion(crit({ field: "n", op: ">=", value: 10 }), "12")).toBe(true);
    expect(meetsCriterion(crit({ field: "n", op: ">=", value: 10 }), 8)).toBe(false);
    expect(meetsCriterion(crit({ field: "n", op: "<=", value: 5 }), 5)).toBe(true);
  });

  it("boolean ==, string/number == , in, contains, exists", () => {
    expect(meetsCriterion(crit({ field: "b", op: "==", value: true }), "yes")).toBe(true);
    expect(meetsCriterion(crit({ field: "b", op: "==", value: true }), false)).toBe(false);
    expect(meetsCriterion(crit({ field: "s", op: "==", value: "smb" }), "smb")).toBe(true);
    expect(meetsCriterion(crit({ field: "r", op: "in", value: ["us", "eu"] }), "eu")).toBe(true);
    expect(meetsCriterion(crit({ field: "t", op: "contains", value: "CRM" }), "wants crm sync")).toBe(true);
    expect(meetsCriterion(crit({ field: "e", op: "exists", value: true }), "anything")).toBe(true);
    expect(meetsCriterion(crit({ field: "e", op: "exists", value: true }), "")).toBe(false);
  });

  it("treats a missing answer as not met", () => {
    expect(meetsCriterion(crit({ field: "n", op: ">=", value: 10 }), undefined)).toBe(false);
  });
});

describe("scoreFit — the invariant: a hard gate is decisive", () => {
  const qual = (criteria: Criterion[], passScore = 60): Qualification => ({
    criteria,
    scoring: { mode: "weighted", passScore },
  });

  it("team_size=8 fails the gate and is NOT qualified, even with everything else met", () => {
    const q = qual([
      crit({ field: "team_size", op: ">=", value: 10, gate: true, weight: 2 }),
      crit({ field: "has_budget", op: "==", value: true, weight: 1 }),
      crit({ field: "authority", op: "==", value: true, weight: 1 }),
    ]);
    const r = scoreFit(q, { team_size: 8, has_budget: true, authority: true });
    expect(r.passed_gates).toBe(false);
    expect(r.qualified).toBe(false);
    expect(r.reason).toContain("gate");
  });

  it("gate passes but weighted score below threshold => not qualified", () => {
    const q = qual(
      [
        crit({ field: "team_size", op: ">=", value: 10, gate: true, weight: 1 }),
        crit({ field: "has_budget", op: "==", value: true, weight: 3 }),
      ],
      60,
    );
    // gate met (weight 1) but budget unmet (weight 3) => score = 25 < 60
    const r = scoreFit(q, { team_size: 20, has_budget: false });
    expect(r.passed_gates).toBe(true);
    expect(r.qualified).toBe(false);
    expect(r.score).toBe(25);
  });

  it("gate passes and weighted score meets threshold => qualified HOT-eligible", () => {
    const q = qual([
      crit({ field: "team_size", op: ">=", value: 10, gate: true, weight: 2 }),
      crit({ field: "has_budget", op: "==", value: true, weight: 1 }),
    ]);
    const r = scoreFit(q, { team_size: 40, has_budget: true });
    expect(r.qualified).toBe(true);
    expect(r.score).toBe(100);
  });

  it("mode 'all' requires every criterion; mode 'any' requires one", () => {
    const criteria = [
      crit({ field: "a", op: "==", value: true }),
      crit({ field: "b", op: "==", value: true }),
    ];
    const all = scoreFit({ criteria, scoring: { mode: "all", passScore: 0 } }, { a: true, b: false });
    expect(all.qualified).toBe(false);
    const any = scoreFit({ criteria, scoring: { mode: "any", passScore: 0 } }, { a: true, b: false });
    expect(any.qualified).toBe(true);
  });
});
