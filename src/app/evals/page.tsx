"use client";

import { useEffect, useState, useCallback } from "react";
import type { AgentRow } from "@/lib/db/types";

interface CaseSummary {
  id: string;
  passed: boolean;
  notes: string;
}
interface RunSummary {
  runId?: string;
  specVersion: number;
  total: number;
  passed: number;
  qualifyRate: number;
  bookRate: number;
  guardrailViolations: number;
  cases: CaseSummary[];
}
interface RunRow {
  id: string;
  spec_version: number | null;
  summary: RunSummary | null;
  created_at: string;
}

export default function EvalsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentId, setAgentId] = useState("");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [latest, setLatest] = useState<RunSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    const a = await fetch("/api/agents").then((r) => r.json());
    setAgents(a.agents ?? []);
    if (!agentId && a.agents?.[0]) setAgentId(a.agents[0].id);
  }, [agentId]);

  const loadRuns = useCallback(async (id: string) => {
    if (!id) return;
    const r = await fetch(`/api/evals?agentId=${id}`).then((x) => x.json());
    setRuns(r.runs ?? []);
    setLatest(r.runs?.[0]?.summary ?? null);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);
  useEffect(() => {
    if (agentId) loadRuns(agentId);
  }, [agentId, loadRuns]);

  async function run() {
    if (!agentId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/evals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setLatest(data);
        await loadRuns(agentId);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Evals</h1>
          <p className="text-xs text-black/50 dark:text-white/50">
            Text-mode harness: LLM-as-lead ↔ same prompt + tools, LLM-as-judge. No telephony.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1.5"
          >
            {agents.length === 0 && <option value="">No agents yet</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · v{a.current_version}
              </option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={running || !agentId}
            className="rounded-lg bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {running ? "Running…" : "Run harness"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      {running && (
        <div className="text-sm text-black/50 dark:text-white/50">
          Running ~10 persona conversations against v
          {agents.find((a) => a.id === agentId)?.current_version}… this takes a minute.
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
              Cases · spec v{latest.specVersion}
            </div>
            <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {latest.cases.map((c) => (
                <li key={c.id} className="px-4 py-3 flex items-start gap-3 text-sm">
                  <span
                    className={
                      "mt-0.5 shrink-0 text-[11px] px-2 py-0.5 rounded-full " +
                      (c.passed
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-red-500/10 text-red-700 dark:text-red-400")
                    }
                  >
                    {c.passed ? "PASS" : "FAIL"}
                  </span>
                  <div>
                    <div className="font-medium">{c.id}</div>
                    <div className="text-[13px] text-black/55 dark:text-white/55">{c.notes}</div>
                  </div>
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
                <span>v{r.spec_version}</span>
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
          Pick an agent and run the harness to see per-case pass/fail tied to the spec version.
        </div>
      )}
    </div>
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
          (tone === "red" ? "text-red-600 dark:text-red-400" : tone === "green" ? "text-emerald-600 dark:text-emerald-400" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
