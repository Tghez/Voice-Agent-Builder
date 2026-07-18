import type { Criterion, Qualification } from "@/lib/spec/schema";

/**
 * Track 1 — Fit scoring. Deterministic, runs mid-call inside qualify_lead. Pure
 * function over the structured values the voice LLM extracted. NO LLM here.
 *
 * Order (per §9a): hard gates first, then a weighted sum vs passScore. Same
 * inputs -> same verdict, always. This is the auditable, unit-tested business
 * rule; Track-2 intent is advisory and can NEVER change this outcome.
 */

export interface FitResult {
  passed_gates: boolean;
  score: number; // 0–100 weighted
  qualified: boolean;
  reason: string;
}

type Answer = unknown;

function toNum(v: Answer): number {
  return typeof v === "number" ? v : Number(v);
}

function toBool(v: Answer): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "yes", "1"].includes(v.toLowerCase());
  if (typeof v === "number") return v !== 0;
  return false;
}

function present(v: Answer): boolean {
  return v !== undefined && v !== null && v !== "";
}

/** Evaluate a single criterion against the extracted answer. Missing => not met. */
export function meetsCriterion(c: Criterion, answer: Answer): boolean {
  if (c.op === "exists") return present(answer);
  if (!present(answer)) return false;

  switch (c.op) {
    case ">=":
      return toNum(answer) >= toNum(c.value);
    case "<=":
      return toNum(answer) <= toNum(c.value);
    case ">":
      return toNum(answer) > toNum(c.value);
    case "<":
      return toNum(answer) < toNum(c.value);
    case "==":
      if (typeof c.value === "boolean") return toBool(answer) === c.value;
      if (typeof c.value === "number") return toNum(answer) === c.value;
      return String(answer) === String(c.value);
    case "!=":
      if (typeof c.value === "boolean") return toBool(answer) !== c.value;
      if (typeof c.value === "number") return toNum(answer) !== c.value;
      return String(answer) !== String(c.value);
    case "in":
      return Array.isArray(c.value) && c.value.map(String).includes(String(answer));
    case "not_in":
      return Array.isArray(c.value) && !c.value.map(String).includes(String(answer));
    case "contains":
      return String(answer).toLowerCase().includes(String(c.value).toLowerCase());
    default:
      return false;
  }
}

export function scoreFit(
  qualification: Qualification,
  answers: Record<string, Answer>,
): FitResult {
  const { criteria, scoring } = qualification;

  const evaluated = criteria.map((c) => ({
    c,
    met: meetsCriterion(c, answers[c.field]),
  }));

  const gates = evaluated.filter((e) => e.c.gate);
  const failedGates = gates.filter((e) => !e.met);
  const passed_gates = failedGates.length === 0;

  const totalWeight = evaluated.reduce((s, e) => s + e.c.weight, 0);
  const metWeight = evaluated.filter((e) => e.met).reduce((s, e) => s + e.c.weight, 0);
  const score =
    totalWeight > 0 ? Math.round((metWeight / totalWeight) * 100) : passed_gates ? 100 : 0;

  let thresholdMet: boolean;
  switch (scoring.mode) {
    case "all":
      thresholdMet = evaluated.every((e) => e.met);
      break;
    case "any":
      thresholdMet = evaluated.some((e) => e.met);
      break;
    case "weighted":
    default:
      thresholdMet = score >= scoring.passScore;
      break;
  }

  const qualified = passed_gates && thresholdMet;

  let reason: string;
  if (!passed_gates) {
    const names = failedGates.map((e) => e.c.label ?? e.c.field).join(", ");
    reason = `Failed required gate(s): ${names}.`;
  } else if (qualified) {
    reason = `Passed all gates; score ${score} ≥ ${scoring.passScore}.`;
  } else {
    reason = `Passed gates but score ${score} < ${scoring.passScore}.`;
  }

  return { passed_gates, score, qualified, reason };
}
