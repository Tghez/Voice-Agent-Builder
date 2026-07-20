"use client";

import type { EvalCaseDetail } from "@/lib/evals/types";
import { failureReasons } from "@/lib/evals/failureReasons";
import { Tag } from "../../dashboard/components/ui";

/**
 * Per-case detail drawer, mirroring the dashboard's CallDetailDrawer. Everything
 * shown is what the case already produced — the agent's own fit breakdown and
 * extracted answers, the persona's ground truth, and the guardrail verdict.
 */
export function EvalCaseDrawer({
  detail,
  onClose,
}: {
  detail: EvalCaseDetail;
  onClose: () => void;
}) {
  const { persona, scores, transcript } = detail;
  const reasons = detail.passed ? [] : failureReasons(scores);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg bg-white dark:bg-[#141414] border-l border-black/10 dark:border-white/10 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-[#141414] px-4 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Tag tone={detail.passed ? "green" : "red"}>{detail.passed ? "PASS" : "FAIL"}</Tag>
            <div className="font-medium text-sm truncate">{detail.id}</div>
          </div>
          <button
            onClick={onClose}
            className="text-sm rounded-md border border-black/10 dark:border-white/15 px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-6 text-sm">
          {reasons.length > 0 && (
            <section>
              <div className="text-[11px] uppercase tracking-wide text-red-600/70 dark:text-red-400/70 mb-1.5">
                Why it failed
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[13px] text-red-700 dark:text-red-400">
                {reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          {persona && (
            <section>
              <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
                Persona
              </div>
              <div className="rounded-lg border border-black/10 dark:border-white/10 px-3 py-2">
                <div className="font-medium">
                  {persona.name} · <span className="text-black/55 dark:text-white/55">{persona.company}</span>
                </div>
                <div className="text-[12px] text-black/55 dark:text-white/55 mt-1">{persona.brief}</div>
                {persona.guardrailProbe && (
                  <div className="mt-1.5">
                    <Tag tone="amber">probes: {persona.guardrailProbe}</Tag>
                  </div>
                )}
              </div>
              {Object.keys(persona.attributes ?? {}).length > 0 && (
                <details className="mt-2">
                  <summary className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 cursor-pointer">
                    Ground-truth attributes
                  </summary>
                  <pre className="mt-2 text-[11px] bg-black/[0.03] dark:bg-white/[0.05] rounded-md p-2 overflow-x-auto">
                    {JSON.stringify(persona.attributes, null, 2)}
                  </pre>
                </details>
              )}
            </section>
          )}

          {scores.fit && (
            <section>
              <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
                Fit — {scores.fit.score} / {scores.fit.passScore} threshold
              </div>
              <div className="mb-2 flex items-center gap-2 flex-wrap">
                <Tag tone={scores.fit.qualified ? "green" : "red"}>
                  {scores.fit.qualified ? "qualified" : "not qualified"}
                </Tag>
                <Tag muted>ground truth: {scores.expected_qualified ? "qualified" : "not qualified"}</Tag>
                <span className="text-[12px] text-black/55 dark:text-white/55">{scores.fit.reason}</span>
              </div>
              <ul className="space-y-1">
                {scores.fit.criteria.map((c) => (
                  <li
                    key={c.field}
                    className="flex items-center justify-between gap-2 text-[12px] rounded-md px-2 py-1 bg-black/[0.02] dark:bg-white/[0.04]"
                  >
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      {c.label}
                      {c.gate && <Tag muted>gate</Tag>}
                    </span>
                    <span
                      className={
                        "shrink-0 " +
                        (c.met ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")
                      }
                    >
                      {c.met ? "met" : "not met"} · {String(c.answer ?? "—")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
              Guardrails
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Tag tone={scores.guardrails_ok ? "green" : "red"}>
                {scores.guardrails_ok ? "held" : "violated"}
              </Tag>
              <span className="text-[12px] text-black/55 dark:text-white/55">{detail.judge_notes}</span>
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
              Action outcome
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag tone={scores.meeting_booked ? "green" : "default"} muted={!scores.meeting_booked}>
                {scores.meeting_booked ? "meeting booked" : "no meeting"}
              </Tag>
              <Tag muted>{scores.callback_scheduled ? "callback scheduled" : "no callback"}</Tag>
              <Tag muted>{scores.action_correct ? "correct action" : "wrong action"}</Tag>
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
              Transcript
            </div>
            {transcript.length === 0 ? (
              <div className="text-[12px] text-black/40 dark:text-white/40">No transcript.</div>
            ) : (
              <div dir="ltr" className="space-y-2 text-left">
                {transcript.map((t, i) => {
                  const isAgent = t.role === "agent";
                  return (
                    <div key={i}>
                      <div
                        className={
                          "text-[10px] uppercase tracking-wide mb-0.5 " +
                          (isAgent ? "text-violet-700 dark:text-violet-400" : "text-cyan-700 dark:text-cyan-400")
                        }
                      >
                        {t.role}
                      </div>
                      <div className={isAgent ? "text-[13px]" : "rounded-lg px-2.5 py-1.5 text-[13px] bg-cyan-500/10"}>
                        {t.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {scores.extracted && Object.keys(scores.extracted).length > 0 && (
            <details>
              <summary className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 cursor-pointer">
                Extracted answers
              </summary>
              <pre className="mt-2 text-[11px] bg-black/[0.03] dark:bg-white/[0.05] rounded-md p-2 overflow-x-auto">
                {JSON.stringify(scores.extracted, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
