"use client";

import { useMemo, useState } from "react";
import type { CallRow } from "@/lib/db/types";
import { Tag, callBand } from "./ui";

type OutcomeFilter = "all" | "qualified" | "not_qualified" | "booked";

export function CallsTable({
  calls,
  leadName,
  onSelect,
}: {
  calls: CallRow[];
  leadName: (id: string | null) => string;
  onSelect: (call: CallRow) => void;
}) {
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (outcome === "qualified" && !c.structured_outcome?.fit?.qualified) return false;
      if (outcome === "not_qualified" && (c.structured_outcome?.fit ? c.structured_outcome.fit.qualified : true))
        return false;
      if (outcome === "booked" && !c.structured_outcome?.meeting_booked) return false;
      return true;
    });
  }, [calls, outcome]);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03]">
      <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-2 flex-wrap">
        <div className="font-medium text-sm">Calls ({filtered.length})</div>
        <div className="flex items-center gap-2 text-[12px]">
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1"
          >
            <option value="all">All outcomes</option>
            <option value="qualified">Qualified</option>
            <option value="not_qualified">Not qualified</option>
            <option value="booked">Booked</option>
          </select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-sm text-black/50 dark:text-white/50">No calls match these filters.</div>
      ) : (
        <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
          {filtered.map((c) => (
            <CallRowItem key={c.id} call={c} leadName={leadName(c.lead_id)} onSelect={() => onSelect(c)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CallRowItem({
  call,
  leadName,
  onSelect,
}: {
  call: CallRow;
  leadName: string;
  onSelect: () => void;
}) {
  const fit = call.structured_outcome?.fit;
  const intent = call.structured_outcome?.intent;
  const booked = call.structured_outcome?.meeting_booked;
  const band = callBand(call);
  return (
    <li>
      <button
        onClick={onSelect}
        className="w-full text-left px-4 py-3 text-sm space-y-1 hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{leadName}</span>
          <span className="text-[12px] text-black/45 dark:text-white/45">
            {new Date(call.created_at).toLocaleString()}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {fit && (
            <Tag tone={fit.qualified ? "green" : "red"}>
              {fit.qualified ? "qualified" : "not qualified"} · {fit.score}
            </Tag>
          )}
          {band && <Tag tone={band === "HOT" ? "amber" : "blue"}>{band}</Tag>}
          {intent && <Tag muted>intent {intent.intent_score}/100</Tag>}
          {booked && <Tag tone="green">booked</Tag>}
          {call.structured_outcome?.callback_scheduled && <Tag muted>callback</Tag>}
          {call.duration_sec != null && <Tag muted>{Math.round(call.duration_sec)}s</Tag>}
          {call.cost_usd != null && <Tag muted>${Number(call.cost_usd).toFixed(2)}</Tag>}
        </div>
      </button>
    </li>
  );
}
