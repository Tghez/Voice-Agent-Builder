"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Vapi from "@vapi-ai/web";
import type { Lead } from "@/lib/providers/crm";
import type { AgentRow, CallRow } from "@/lib/db/types";
import { KpiRow } from "./components/KpiRow";
import { CallsTable } from "./components/CallsTable";
import { CallDetailDrawer } from "./components/CallDetailDrawer";
import { ConfirmCallDialog } from "./components/ConfirmCallDialog";
import { LeadsPanel } from "./components/LeadsPanel";
import { AgentRail, AGENT_RAIL_WIDTH } from "./components/AgentRail";

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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<{ leadName: string; vapiCallId: string | null } | null>(
    null,
  );
  const [pendingLead, setPendingLead] = useState<Lead | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallRow | null>(null);
  const [agentRailOpen, setAgentRailOpen] = useState(true);

  const vapiRef = useRef<Vapi | null>(null);

  const loadLeadsAndAgents = useCallback(async () => {
    const [l, a] = await Promise.all([
      fetch("/api/leads").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
    ]);
    setLeads(l.leads ?? []);
    setAgents(a.agents ?? []);
    setAgentId((prev) => prev || a.agents?.[0]?.id || "");
  }, []);

  useEffect(() => {
    loadLeadsAndAgents();
  }, [loadLeadsAndAgents]);

  // Only fetch calls once we know which agent to scope to — otherwise the
  // first render (before the default agent is picked) briefly fetches every
  // agent's calls unscoped, then flashes to the scoped list once agentId lands.
  const loadCalls = useCallback(async () => {
    if (!agentId) return;
    const c = await fetch(`/api/calls?agentId=${agentId}`).then((r) => r.json());
    setCalls(c.calls ?? []);
  }, [agentId]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  // The Vapi wiring effect below is mount-once, so it would otherwise close
  // over a stale loadCalls (agentId="" from the very first render) — keep a
  // ref pointing at the latest one instead.
  const loadCallsRef = useRef(loadCalls);
  useEffect(() => {
    loadCallsRef.current = loadCalls;
  }, [loadCalls]);

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
      loadCallsRef.current();
      setTimeout(() => loadCallsRef.current(), 3000);
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
          body: JSON.stringify({ agentId, leadId: lead.id, mode: "live", vapiCallId: call.id }),
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
  const leadName = (id: string | null) => leads.find((l) => l.id === id)?.name ?? id ?? "—";
  const currentAgent = agents.find((a) => a.id === agentId);

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
        <h1 className="text-lg font-semibold">Dashboard</h1>

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

        <KpiRow calls={liveCalls} />

        <div className="grid gap-4 lg:grid-cols-2">
          <LeadsPanel leads={leads} busyId={busy} disabled={!!activeCall} onCall={setPendingLead} />
          <CallsTable calls={calls} leadName={leadName} onSelect={setSelectedCall} />
        </div>
      </div>

      {pendingLead && (
        <ConfirmCallDialog
          lead={pendingLead}
          agentName={currentAgent?.name ?? "This agent"}
          onCancel={() => setPendingLead(null)}
          onConfirm={() => {
            const lead = pendingLead;
            setPendingLead(null);
            placeCall(lead);
          }}
        />
      )}

      {selectedCall && (
        <CallDetailDrawer
          call={selectedCall}
          leadName={leadName(selectedCall.lead_id)}
          onClose={() => setSelectedCall(null)}
        />
      )}
    </>
  );
}
