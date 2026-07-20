import type { CallRow } from "@/lib/db/types";
import { normalizeTranscript, isAgentRole } from "@/lib/transcript";
import { Tag } from "./ui";

export function CallDetailDrawer({
  call,
  leadName,
  onClose,
}: {
  call: CallRow;
  leadName: string;
  onClose: () => void;
}) {
  const fit = call.structured_outcome?.fit;
  const intent = call.structured_outcome?.intent;
  const meeting = call.structured_outcome?.meeting;
  const extracted = call.structured_outcome?.extracted;
  const turns = normalizeTranscript(call.transcript);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg bg-white dark:bg-[#141414] border-l border-black/10 dark:border-white/10 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-[#141414] px-4 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">{leadName}</div>
            <div className="text-[12px] text-black/45 dark:text-white/45">
              {new Date(call.created_at).toLocaleString()}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-sm rounded-md border border-black/10 dark:border-white/15 px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-6 text-sm">
          {meeting && (
            <section>
              <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
                Meeting booked
              </div>
              <div className="rounded-lg border border-black/10 dark:border-white/10 px-3 py-2">
                <div className="font-medium">{meeting.label}</div>
                <div className="text-[12px] text-black/45 dark:text-white/45">Confirmation {meeting.bookingId}</div>
              </div>
            </section>
          )}

          {fit && (
            <section>
              <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
                Fit — {fit.score} / {fit.passScore} threshold
              </div>
              <div className="mb-2 flex items-center gap-2 flex-wrap">
                <Tag tone={fit.qualified ? "green" : "red"}>{fit.qualified ? "qualified" : "not qualified"}</Tag>
                <span className="text-[12px] text-black/55 dark:text-white/55">{fit.reason}</span>
              </div>
              <ul className="space-y-1">
                {fit.criteria.map((c) => (
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
                        "shrink-0 " + (c.met ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")
                      }
                    >
                      {c.met ? "met" : "not met"} · {String(c.answer ?? "—")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {intent && (
            <section>
              <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
                Intent (advisory)
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <Tag muted>score {intent.intent_score}/100</Tag>
                <Tag muted>{intent.stage}</Tag>
                <Tag muted>{intent.urgency} urgency</Tag>
              </div>
              {intent.signals.length > 0 && (
                <div className="mb-2">
                  <div className="text-[12px] text-black/45 dark:text-white/45 mb-1">Signals</div>
                  <ul className="list-disc list-inside text-[12px] space-y-0.5">
                    {intent.signals.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {intent.objections.length > 0 && (
                <div>
                  <div className="text-[12px] text-black/45 dark:text-white/45 mb-1">Objections</div>
                  <ul className="list-disc list-inside text-[12px] space-y-0.5">
                    {intent.objections.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section>
            <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
              Transcript
            </div>
            {turns.length === 0 ? (
              <div className="text-[12px] text-black/40 dark:text-white/40">No transcript yet.</div>
            ) : (
              <div dir="ltr" className="space-y-2 text-left">
                {turns.map((t, i) => {
                  const isAgent = isAgentRole(t.role);
                  return (
                    <div key={i}>
                      <div
                        className={
                          "text-[10px] uppercase tracking-wide mb-0.5 " +
                          (isAgent ? "text-violet-700 dark:text-violet-400" : "text-cyan-700 dark:text-cyan-400")
                        }
                      >
                        {t.role || "—"}
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

          {extracted && Object.keys(extracted).length > 0 && (
            <details>
              <summary className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 cursor-pointer">
                Extracted answers
              </summary>
              <pre className="mt-2 text-[11px] bg-black/[0.03] dark:bg-white/[0.05] rounded-md p-2 overflow-x-auto">
                {JSON.stringify(extracted, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
