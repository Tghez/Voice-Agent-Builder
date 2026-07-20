import type { CallRow } from "@/lib/db/types";
import { Stat } from "./ui";

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function computeKpis(calls: CallRow[]) {
  const withFit = calls.filter((c) => c.structured_outcome?.fit);
  const qualified = withFit.filter((c) => c.structured_outcome?.fit?.qualified);
  const booked = calls.filter((c) => c.structured_outcome?.meeting_booked);
  const costs = calls.map((c) => Number(c.cost_usd)).filter((n) => !Number.isNaN(n));
  const fitScores = withFit.map((c) => c.structured_outcome!.fit!.score);
  const intentScores = calls
    .map((c) => c.structured_outcome?.intent?.intent_score)
    .filter((n): n is number => typeof n === "number");
  const durations = calls
    .map((c) => c.duration_sec)
    .filter((n): n is number => typeof n === "number");

  return {
    total: calls.length,
    qualifyRate: withFit.length ? Math.round((qualified.length / withFit.length) * 100) : 0,
    bookRate: calls.length ? Math.round((booked.length / calls.length) * 100) : 0,
    avgCost: avg(costs),
    avgFitScore: avg(fitScores),
    avgIntentScore: avg(intentScores),
    avgDurationSec: avg(durations),
  };
}

export function KpiRow({ calls }: { calls: CallRow[] }) {
  const k = computeKpis(calls);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      <Stat label="Live calls" value={String(k.total)} />
      <Stat label="Qualify rate" value={k.total ? `${k.qualifyRate}%` : "—"} />
      <Stat label="Book rate" value={k.total ? `${k.bookRate}%` : "—"} />
      <Stat label="Avg fit score" value={k.avgFitScore != null ? String(Math.round(k.avgFitScore)) : "—"} />
      <Stat label="Avg intent" value={k.avgIntentScore != null ? String(Math.round(k.avgIntentScore)) : "—"} />
      <Stat
        label="Avg duration"
        value={k.avgDurationSec != null ? `${Math.round(k.avgDurationSec)}s` : "—"}
      />
      <Stat label="Avg cost" value={k.avgCost != null ? `$${k.avgCost.toFixed(2)}` : "—"} />
    </div>
  );
}
