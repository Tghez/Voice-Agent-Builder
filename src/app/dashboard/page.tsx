"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Vapi from "@vapi-ai/web";
import type { Lead } from "@/lib/providers/crm";
import type { AgentRow, CallRow } from "@/lib/db/types";

type Mode = "test" | "live";

/** Mirrors renderLeadContext() in lib/providers/crm.ts — kept inline so this
 *  client component doesn't pull server-only CRM code into the browser bundle. */
function renderLeadContext(lead: Lead): string {
  return [
    `Name: ${lead.name}`,
    `Title: ${lead.title}`,
    `Company: ${lead.company}`,
    `Email: ${lead.email}`,
    `CRM status: ${lead.status}`,
    `Notes: ${lead.notes}`,
  ].join("\n");
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("live");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<{ leadName: string; vapiCallId: string | null } | null>(
    null,
  );

  const vapiRef = useRef<Vapi | null>(null);

  const load = useCallback(async () => {
    const [l, a, c] = await Promise.all([
      fetch("/api/leads").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/calls").then((r) => r.json()),
    ]);
    setLeads(l.leads ?? []);
    setAgents(a.agents ?? []);
    setCalls(c.calls ?? []);
    if (!agentId && a.agents?.[0]) setAgentId(a.agents[0].id);
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Wire the Vapi Web SDK once and reuse the instance across calls.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!key) return;
    const vapi = new Vapi(key);
    vapiRef.current = vapi;

    const onCallEnd = () => {
      setActiveCall(null);
      setBusy(null);
      // The end-of-call webhook persists async — refetch once immediately and
      // again after a beat to pick up transcript/analysis once it lands.
      load();
      setTimeout(load, 3000);
    };
    const onError = (e: unknown) => {
      setError((e as Error)?.message ?? "Call error");
      setActiveCall(null);
      setBusy(null);
    };

    vapi.on("call-end", onCallEnd);
    vapi.on("error", onError);
    return () => {
      vapi.removeListener("call-end", onCallEnd);
      vapi.removeListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function placeCall(lead: Lead) {
    setError(null);
    if (!agentId) {
      setError("Create an agent in the Builder first.");
      return;
    }
    const agent = agents.find((a) => a.id === agentId);
    if (!agent?.vapi_assistant_id) {
      setError("This agent hasn't been compiled yet.");
      return;
    }
    const vapi = vapiRef.current;
    if (!vapi) {
      setError("Missing NEXT_PUBLIC_VAPI_PUBLIC_KEY — set it in .env.local and restart the dev server.");
      return;
    }

    setBusy(lead.id);
    setActiveCall({ leadName: lead.name, vapiCallId: null });
    try {
      const call = await vapi.start(agent.vapi_assistant_id, {
        variableValues: { leadContext: renderLeadContext(lead) },
      });
      if (call?.id) {
        setActiveCall({ leadName: lead.name, vapiCallId: call.id });
        await fetch("/api/calls/web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, leadId: lead.id, mode, vapiCallId: call.id }),
        });
      }
    } catch (e) {
      setError((e as Error).message);
      setActiveCall(null);
      setBusy(null);
    }
  }

  function hangUp() {
    vapiRef.current?.stop();
  }

  const liveCalls = calls.filter((c) => c.mode === "live");
  const agg = aggregate(liveCalls);
  const leadName = (id: string | null) => leads.find((l) => l.id === id)?.name ?? id ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1.5"
          >
            {agents.length === 0 && <option value="">No agents yet</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="flex rounded-md border border-black/10 dark:border-white/15 overflow-hidden">
            {(["live", "test"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  "px-3 py-1.5 " +
                  (mode === m ? "bg-black text-white dark:bg-white dark:text-black" : "")
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

      {activeCall && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium">Live call · {activeCall.leadName}</div>
            {activeCall.vapiCallId ? (
              <a
                href={`https://dashboard.vapi.ai/calls/${activeCall.vapiCallId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-black/55 dark:text-white/55 hover:underline"
              >
                Watch it live on Vapi ↗
              </a>
            ) : (
              <div className="text-[12px] text-black/40 dark:text-white/40">Connecting…</div>
            )}
          </div>
          <button
            onClick={hangUp}
            className="shrink-0 text-xs rounded-md border border-red-500/30 text-red-600 dark:text-red-400 px-2.5 py-1.5 hover:bg-red-500/10"
          >
            Hang up
          </button>
        </div>
      )}

      {/* Aggregates (live only) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Live calls" value={String(agg.total)} />
        <Stat label="Qualify rate" value={agg.total ? `${agg.qualifyRate}%` : "—"} />
        <Stat label="Book rate" value={agg.total ? `${agg.bookRate}%` : "—"} />
        <Stat label="Avg cost" value={agg.avgCost != null ? `$${agg.avgCost.toFixed(2)}` : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leads */}
        <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03]">
          <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 font-medium text-sm">
            Leads ({leads.length})
          </div>
          <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
            {leads.map((l) => (
              <li key={l.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {l.name} <span className="text-black/40 dark:text-white/40 font-normal">· {l.title}</span>
                  </div>
                  <div className="text-[13px] text-black/55 dark:text-white/55">{l.company}</div>
                  <div className="text-[12px] text-black/45 dark:text-white/45 line-clamp-2 mt-0.5">{l.notes}</div>
                </div>
                <button
                  onClick={() => placeCall(l)}
                  disabled={busy === l.id || !!activeCall}
                  className="shrink-0 text-xs rounded-md border border-black/10 dark:border-white/15 px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
                >
                  {busy === l.id ? "Calling…" : "Call"}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Calls */}
        <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03]">
          <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 font-medium text-sm">
            Calls ({calls.length})
          </div>
          {calls.length === 0 ? (
            <div className="px-4 py-6 text-sm text-black/50 dark:text-white/50">
              No calls yet. Place one from the leads list.
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {calls.map((c) => (
                <CallRowItem key={c.id} call={c} leadName={leadName(c.lead_id)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function CallRowItem({ call, leadName }: { call: CallRow; leadName: string }) {
  const fit = call.structured_outcome?.fit;
  const intent = call.structured_outcome?.intent;
  const booked = call.structured_outcome?.meeting_booked;
  const band = fit?.qualified ? (intent && intent.intent_score >= 60 ? "HOT" : "COLD") : null;
  return (
    <li className="px-4 py-3 text-sm space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{leadName}</span>
        <span className="flex items-center gap-1.5">
          <Tag muted>{call.mode}</Tag>
          <span className="text-[12px] text-black/45 dark:text-white/45">{call.status}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {fit && (
          <Tag tone={fit.qualified ? "green" : "red"}>
            {fit.qualified ? "qualified" : "not qualified"} · {fit.score}
          </Tag>
        )}
        {band && <Tag tone={band === "HOT" ? "amber" : "blue"}>{band}</Tag>}
        {intent && <Tag muted>intent {intent.intent_score}</Tag>}
        {booked && <Tag tone="green">booked</Tag>}
        {call.structured_outcome?.callback_scheduled && <Tag muted>callback</Tag>}
        {call.duration_sec != null && <Tag muted>{Math.round(call.duration_sec)}s</Tag>}
        {call.cost_usd != null && <Tag muted>${Number(call.cost_usd).toFixed(2)}</Tag>}
      </div>
    </li>
  );
}

function aggregate(calls: CallRow[]) {
  const withFit = calls.filter((c) => c.structured_outcome?.fit);
  const qualified = withFit.filter((c) => c.structured_outcome?.fit?.qualified);
  const booked = calls.filter((c) => c.structured_outcome?.meeting_booked);
  const costs = calls.map((c) => Number(c.cost_usd)).filter((n) => !Number.isNaN(n));
  return {
    total: calls.length,
    qualifyRate: withFit.length ? Math.round((qualified.length / withFit.length) * 100) : 0,
    bookRate: calls.length ? Math.round((booked.length / calls.length) * 100) : 0,
    avgCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Tag({
  children,
  tone = "default",
  muted,
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "red" | "amber" | "blue";
  muted?: boolean;
}) {
  const tones: Record<string, string> = {
    default: "bg-black/5 dark:bg-white/10",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    red: "bg-red-500/10 text-red-700 dark:text-red-400",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${muted ? tones.default : tones[tone]}`}>
      {children}
    </span>
  );
}
