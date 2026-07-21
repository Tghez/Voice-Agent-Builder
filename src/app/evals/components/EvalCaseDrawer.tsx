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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl bg-white dark:bg-[#141414] border-l border-black/10 dark:border-white/10 overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-[#141414]/95 backdrop-blur px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <Tag tone={detail.passed ? "green" : "amber"}>
                {detail.passed ? "Passed" : "Needs Revision"}
              </Tag>
              <span className="text-[11px] uppercase tracking-wider text-black/35 dark:text-white/35">
                Case detail
              </span>
            </div>
            <h2 className="text-base font-semibold truncate">
              {persona?.name ?? detail.persona?.id ?? detail.id}
            </h2>
            {persona?.company && (
              <div className="text-[13px] text-black/50 dark:text-white/50 truncate">{persona.company}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[13px] rounded-lg border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-6 space-y-8">
          {reasons.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                What to improve
              </div>
              <ul className="list-disc list-outside pl-4 space-y-1 text-[13.5px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                {reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {persona && (
            <Section title="Persona">
              <div className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-3.5 bg-black/[0.015] dark:bg-white/[0.02]">
                <div className="text-[15px] font-medium">
                  {persona.name}
                  {persona.company && (
                    <span className="text-black/45 dark:text-white/45 font-normal"> · {persona.company}</span>
                  )}
                </div>
                <div className="text-[13.5px] leading-relaxed text-black/60 dark:text-white/60 mt-1.5">
                  {persona.brief}
                </div>
                {persona.guardrailProbe && (
                  <div className="mt-3">
                    <Tag tone="amber">probes: {persona.guardrailProbe}</Tag>
                  </div>
                )}
              </div>
              {Object.keys(persona.attributes ?? {}).length > 0 && (
                <details className="mt-3 group">
                  <summary className="text-[12px] font-medium text-black/50 dark:text-white/50 cursor-pointer hover:text-black/70 dark:hover:text-white/70 select-none transition-colors">
                    Ground-truth attributes
                  </summary>
                  <pre className="mt-2.5 text-[12px] leading-relaxed bg-black/[0.03] dark:bg-white/[0.05] rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(persona.attributes, null, 2)}
                  </pre>
                </details>
              )}
            </Section>
          )}

          {scores.fit && (
            <Section
              title="Fit"
              meta={
                <span className="tabular-nums">
                  {scores.fit.score}
                  <span className="text-black/35 dark:text-white/35"> / {scores.fit.passScore} threshold</span>
                </span>
              }
            >
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <Tag tone={scores.fit.qualified ? "green" : "red"}>
                  {scores.fit.qualified ? "qualified" : "not qualified"}
                </Tag>
                <Tag muted>ground truth: {scores.expected_qualified ? "qualified" : "not qualified"}</Tag>
              </div>
              {scores.fit.reason && (
                <p className="text-[13.5px] leading-relaxed text-black/60 dark:text-white/60 mb-3">
                  {scores.fit.reason}
                </p>
              )}
              <ul className="space-y-1.5">
                {scores.fit.criteria.map((c) => (
                  <li
                    key={c.field}
                    className="flex items-center justify-between gap-3 text-[13px] rounded-lg px-3 py-2 bg-black/[0.03] dark:bg-white/[0.04]"
                  >
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <span className="truncate">{c.label}</span>
                      {c.gate && <Tag muted>gate</Tag>}
                    </span>
                    <span
                      className={
                        "shrink-0 font-medium " +
                        (c.met ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")
                      }
                    >
                      {c.met ? "met" : "not met"}
                      <span className="text-black/40 dark:text-white/40 font-normal"> · {String(c.answer ?? "—")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Guardrails">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Tag tone={scores.guardrails_ok ? "green" : "red"}>
                {scores.guardrails_ok ? "held" : "violated"}
              </Tag>
            </div>
            {detail.judge_notes && (
              <p className="text-[13.5px] leading-relaxed text-black/60 dark:text-white/60">{detail.judge_notes}</p>
            )}
          </Section>

          <Section title="Action outcome">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag tone={scores.meeting_booked ? "green" : "default"} muted={!scores.meeting_booked}>
                {scores.meeting_booked ? "meeting booked" : "no meeting"}
              </Tag>
              <Tag muted>{scores.callback_scheduled ? "callback scheduled" : "no callback"}</Tag>
              <Tag tone={scores.action_correct ? "green" : "red"}>
                {scores.action_correct ? "correct action" : "wrong action"}
              </Tag>
            </div>
          </Section>

          <Section title="Transcript">
            {transcript.length === 0 ? (
              <div className="text-[13px] text-black/40 dark:text-white/40">No transcript.</div>
            ) : (
              <div dir="ltr" className="space-y-3.5 text-left">
                {transcript.map((t, i) => {
                  const isAgent = t.role === "agent";
                  return (
                    <div key={i}>
                      <div
                        className={
                          "text-[10px] font-semibold uppercase tracking-wider mb-1 " +
                          (isAgent ? "text-violet-700 dark:text-violet-400" : "text-cyan-700 dark:text-cyan-400")
                        }
                      >
                        {t.role}
                      </div>
                      <div
                        className={
                          isAgent
                            ? "text-[13.5px] leading-relaxed text-black/80 dark:text-white/80"
                            : "rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-cyan-500/10 text-black/80 dark:text-white/80"
                        }
                      >
                        {t.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {scores.extracted && Object.keys(scores.extracted).length > 0 && (
            <details className="group">
              <summary className="text-[12px] font-medium text-black/50 dark:text-white/50 cursor-pointer hover:text-black/70 dark:hover:text-white/70 select-none transition-colors">
                Extracted answers
              </summary>
              <pre className="mt-2.5 text-[12px] leading-relaxed bg-black/[0.03] dark:bg-white/[0.05] rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(scores.extracted, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

/** A titled block with a small uppercase heading and an optional right-aligned meta. */
function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3 pb-1.5 border-b border-black/[0.06] dark:border-white/[0.08]">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
          {title}
        </h3>
        {meta && <div className="text-[12px] text-black/55 dark:text-white/55 tabular-nums">{meta}</div>}
      </div>
      {children}
    </section>
  );
}
