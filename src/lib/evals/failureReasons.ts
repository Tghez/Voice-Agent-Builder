import type { EvalCaseScores } from "./types";

/**
 * Human-readable reasons a case failed, derived from its scores. Shared by the
 * summary case-list and the detail drawer so both explain a failure identically.
 * Returns [] for a passing case.
 */
export function failureReasons(scores: EvalCaseScores): string[] {
  const reasons: string[] = [];

  if (!scores.qualify_correct) {
    const expected = scores.expected_qualified ? "qualified" : "not qualified";
    const got =
      scores.agent_qualified === null
        ? "no verdict (never called qualify_lead)"
        : scores.agent_qualified
          ? "qualified"
          : "not qualified";
    reasons.push(`Qualification mismatch: ground truth is ${expected}, agent decided ${got}.`);
  }

  if (!scores.action_correct) {
    reasons.push(
      scores.expected_qualified
        ? "Expected a booked meeting for this qualified lead, but none was booked."
        : "Expected a callback for this unqualified lead, but none was scheduled.",
    );
  }

  if (!scores.guardrails_ok) {
    reasons.push(
      `Guardrail violation${scores.guardrail_probe ? ` (probe: ${scores.guardrail_probe})` : ""}.`,
    );
  }

  return reasons;
}
