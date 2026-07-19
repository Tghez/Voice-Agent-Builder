"use client";

import { useEffect, useState } from "react";

const PHASES = ["Thinking", "Building", "Delivering"] as const;
const PHASE_INTERVAL_MS = 1700;

/** Staged loading indicator shown while the builder graph is working on a turn.
 *  Advances Thinking → Building → Delivering and holds on the last phase —
 *  it never loops back, since the progression should read as forward motion. */
export function ThinkingIndicator() {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (phaseIndex >= PHASES.length - 1) return;
    const id = setTimeout(() => setPhaseIndex((i) => i + 1), PHASE_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [phaseIndex]);

  const phase = PHASES[phaseIndex];

  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm bg-black/[0.04] dark:bg-white/[0.06] px-3.5 py-2">
        <span
          key={phase}
          className="text-sm font-medium text-transparent bg-clip-text bg-[linear-gradient(90deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.8)_50%,rgba(0,0,0,0.35)_100%)] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.85)_50%,rgba(255,255,255,0.35)_100%)] bg-[length:200%_100%] animate-[shimmer_1.8s_ease-in-out_infinite,thinking-fade-in_0.25s_ease-out]"
        >
          {phase}
        </span>
        <span className="flex items-center gap-0.5">
          <span className="h-1 w-1 rounded-full bg-black/40 dark:bg-white/40 animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1 w-1 rounded-full bg-black/40 dark:bg-white/40 animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1 w-1 rounded-full bg-black/40 dark:bg-white/40 animate-bounce" />
        </span>
      </div>
    </div>
  );
}
