"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentRow } from "@/lib/db/types";
import type { EvalSummary, EvalCaseDetail } from "@/lib/evals/types";
import { useEvalRun, runEvaluation, isEvalRunning, dismissEvalError } from "@/lib/evalRunStore";
import { AgentRail, AGENT_RAIL_WIDTH } from "../dashboard/components/AgentRail";
import { EvalCaseDrawer } from "./components/EvalCaseDrawer";
import { RunningBanner } from "./components/RunningBanner";

interface RunRow {
  id: string;
  summary: EvalSummary | null;
  created_at: string;
}

export default function EvalsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentId, setAgentId] = useState("");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [agentRailOpen, setAgentRailOpen] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<EvalCaseDetail | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);

  const run = useEvalRun();
  const running = isEvalRunning(run);
  const agentName = agents.find((a) => a.id === agentId)?.name ?? "agent";

  const loadAgents = useCallback(async () => {
    const a = await fetch("/api/agents").then((r) => r.json());
    setAgents(a.agents ?? []);
    if (!agentId && a.agents?.[0]) setAgentId(a.agents[0].id);
  }, [agentId]);

  const loadRuns = useCallback(async (id: string) => {
    if (!id) return;
    const r = await fetch(`/api/evals?agentId=${id}`).then((x) => x.json());
    setRuns(r.runs ?? []);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);
  useEffect(() => {
    if (agentId) loadRuns(agentId);
  }, [agentId, loadRuns]);

  // When a run finishes for the selected agent, refresh the runs list once.
  const lastSynced = useRef<number | null>(null);
  useEffect(() => {
    if (
      run.status === "done" &&
      run.agentId === agentId &&
      run.startedAt &&
      run.startedAt !== lastSynced.current
    ) {
      lastSynced.current = run.startedAt;
      loadRuns(agentId);
    }
  }, [run.status, run.agentId, run.startedAt, agentId, loadRuns]);

  // Prefer the fresh in-memory summary for the just-run agent, else the server's latest.
  const runLatest = run.agentId === agentId ? run.latest : null;
  const latest = runLatest ?? runs[0]?.summary ?? null;
  const runError = run.status === "error" ? run.error : null;
  const runningOther = running && run.agentId !== agentId;

  async function selectCase(caseId: string) {
    setSelectedCaseId(caseId);
    setCaseLoading(true);
    setCaseDetail(null);
    try {
      const r = await fetch(`/api/evals?caseId=${caseId}`).then((x) => x.json());
      setCaseDetail(r.case ?? null);
    } finally {
      setCaseLoading(false);
    }
  }

  const buttonLabel =
    run.status === "generating"
      ? "Generating…"
      : run.status === "running"
        ? "Running…"
        : "Run Evaluation";

  return (
    <>
      <AgentRail
        agents={agents}
        selectedId={agentId}
        onSelect={setAgentId}
        open={agentRailOpen}
        onToggle={() => setAgentRailOpen((o) => !o)}
      />
      <div
        className="space-y-6 transition-[margin-left] duration-300 ease-out"
        style={{ marginLeft: agentRailOpen ? AGENT_RAIL_WIDTH : "0" }}
      >
        <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-gradient-to-br from-black/[0.03] to-transparent dark:from-white/[0.05] dark:to-transparent px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="grid place-items-center h-8 w-8 rounded-lg bg-black text-white dark:bg-white dark:text-black shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                    <path d="m9 11 3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>
                <h1 className="text-2xl font-semibold tracking-tight">Evals</h1>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-black/[0.06] dark:bg-white/10 text-black/55 dark:text-white/55 truncate">
                  {agentName}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-black/55 dark:text-white/55">
                Spec-grounded evaluation: 10 personas built from this agent&apos;s own criteria, deterministic
                qualification ground truth, LLM-as-judge only for guardrails.
              </p>
            </div>
            <button
              onClick={() => agentId && runEvaluation(agentId, agentName)}
              disabled={running || !agentId}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-black text-white dark:bg-white dark:text-black px-5 py-2.5 text-sm font-medium shadow-sm disabled:opacity-40 transition-all hover:opacity-90 hover:shadow-md cursor-pointer disabled:cursor-not-allowed disabled:shadow-none"
            >
              {running && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
              {buttonLabel}
            </button>
          </div>
        </div>

        {running && run.startedAt != null && (
          <RunningBanner
            phase={run.status === "generating" ? "generating" : "running"}
            agentName={run.agentName ?? "agent"}
            startedAt={run.startedAt}
          />
        )}
        {runningOther && (
          <div className="text-[12px] text-black/45 dark:text-white/45">
            A run is in progress for <span className="font-medium">{run.agentName}</span>. You can watch it
            here; new runs are queued until it finishes.
          </div>
        )}

        {runError && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <span>
              Eval run{run.agentName ? ` for ${run.agentName}` : ""} failed: {runError}
            </span>
            <button
              onClick={dismissEvalError}
              className="text-[12px] rounded-md border border-red-500/30 px-2 py-0.5 hover:bg-red-500/10"
            >
              Dismiss
            </button>
          </div>
        )}

        {latest && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Stat label="Cases" value={String(latest.total)} />
              <Stat label="Passed" value={`${latest.passed}/${latest.total}`} />
              <Stat label="Qualify accuracy" value={`${latest.qualifyRate}%`} />
              <Stat label="Book rate" value={`${latest.bookRate}%`} />
              <Stat
                label="Guardrail viol."
                value={String(latest.guardrailViolations)}
                tone={latest.guardrailViolations > 0 ? "red" : "green"}
              />
            </div>

            <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03]">
              <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 text-sm font-medium">
                Cases
              </div>
              <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                {latest.cases.map((c) => (
                  <li key={c.caseId}>
                    <button
                      onClick={() => selectCase(c.caseId)}
                      className="w-full text-left px-4 py-3 flex items-start gap-3 text-sm hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
                    >
                      <span
                        className={
                          "mt-0.5 shrink-0 w-16 text-center text-[11px] leading-tight px-2 py-0.5 rounded-xl " +
                          (c.passed
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400")
                        }
                      >
                        {c.passed ? "Passed" : "Needs Revision"}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">{c.id}</div>
                        <div className="text-[13px] text-black/55 dark:text-white/55">{c.notes}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {runs.length > 0 && (
          <section className="text-sm">
            <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-2">
              Previous runs
            </div>
            <ul className="space-y-1">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center gap-3 text-[13px] text-black/60 dark:text-white/60">
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                  {r.summary && (
                    <span>
                      {r.summary.passed}/{r.summary.total} passed · qualify {r.summary.qualifyRate}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!latest && !running && (
          <div className="text-sm text-black/50 dark:text-white/50">
            Pick an agent to run the evaluation.
          </div>
        )}
      </div>

      {selectedCaseId && (caseLoading || caseDetail) && (
        <>
          {caseDetail ? (
            <EvalCaseDrawer
              detail={caseDetail}
              onClose={() => {
                setSelectedCaseId(null);
                setCaseDetail(null);
              }}
            />
          ) : (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-black/30"
              onClick={() => setSelectedCaseId(null)}
            >
              <div className="h-full w-full max-w-lg bg-white dark:bg-[#141414] border-l border-black/10 dark:border-white/10 p-4 text-sm text-black/50 dark:text-white/50">
                Loading case…
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "green";
}) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">{label}</div>
      <div
        className={
          "text-xl font-semibold mt-0.5 " +
          (tone === "red"
            ? "text-red-600 dark:text-red-400"
            : tone === "green"
              ? "text-emerald-600 dark:text-emerald-400"
              : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
