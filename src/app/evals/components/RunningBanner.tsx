"use client";

import { useEffect, useState } from "react";

/**
 * Professional in-progress indicator for an eval run. Shows the live phase as a
 * two-step tracker, the target agent, and an elapsed timer. Persists across view
 * switches because its state comes from the module-level evalRunStore.
 */
export function RunningBanner({
  phase,
  agentName,
  startedAt,
}: {
  phase: "generating" | "running";
  agentName: string;
  startedAt: number | null;
}) {
  const elapsed = useElapsed(startedAt);

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.06] dark:border-amber-400/25 dark:bg-amber-400/[0.06] px-4 py-3"
      role="status"
      aria-live="polite"
    >
      {/* subtle sweeping shimmer */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-amber-400/10 to-transparent" />
      <div className="relative flex items-center gap-3">
        <Spinner />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>{phase === "generating" ? "Generating test cases" : "Running evaluation"}</span>
            <span className="text-black/30 dark:text-white/30">·</span>
            <span className="truncate text-black/60 dark:text-white/60">{agentName}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-black/50 dark:text-white/50">
            <Step label="Generate cases" state={phase === "generating" ? "active" : "done"} />
            <span className="h-px w-4 bg-black/15 dark:bg-white/20" />
            <Step
              label="Run 10 conversations"
              state={phase === "running" ? "active" : "pending"}
            />
            <span className="text-black/30 dark:text-white/30">·</span>
            <span>This may take a few minutes</span>
          </div>
        </div>
        <div className="shrink-0 text-[12px] tabular-nums text-black/45 dark:text-white/45">
          {elapsed}
        </div>
      </div>

      <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
    </section>
  );
}

function Step({ label, state }: { label: string; state: "done" | "active" | "pending" }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={
          "inline-block h-1.5 w-1.5 rounded-full " +
          (state === "active"
            ? "bg-amber-500 animate-pulse"
            : state === "done"
              ? "bg-emerald-500"
              : "bg-black/20 dark:bg-white/25")
        }
      />
      <span className={state === "pending" ? "opacity-50" : ""}>{label}</span>
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 shrink-0 animate-spin text-amber-500"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (startedAt == null) return "0:00";
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
