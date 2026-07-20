"use client";

import type { AgentRow } from "@/lib/db/types";

/** Half the builder rail's RAIL_WIDTH — this panel is a lightweight agent
 *  switcher, not a detail panel, so it doesn't need the full 20vw. */
export const AGENT_RAIL_WIDTH = "clamp(140px, 10vw, 210px)";

/** Left-side agent panel — mirrors the builder's RightRail (same slide/toggle
 *  chrome) but docked left, half the width, and open by default, since here
 *  "which agent am I looking at" is the primary orientation, not a secondary
 *  detail panel. */
export function AgentRail({
  agents,
  selectedId,
  onSelect,
  open,
  onToggle,
}: {
  agents: AgentRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        onClick={onToggle}
        title={open ? "Close panel" : "Open panel"}
        aria-label={open ? "Close panel" : "Open panel"}
        aria-pressed={open}
        className={
          "fixed top-2.5 left-4 z-50 grid place-items-center h-9 w-9 rounded-lg border transition-colors cursor-pointer backdrop-blur " +
          (open
            ? "border-black/15 dark:border-white/20 bg-black/5 dark:bg-white/10 text-black dark:text-white"
            : "border-black/10 dark:border-white/15 bg-white/90 dark:bg-neutral-900/90 text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white")
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px]"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
      </button>

      <div
        className="fixed top-14 bottom-0 left-0 z-40 border-r border-black/10 dark:border-white/10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-xl flex flex-col transition-transform duration-300 ease-out"
        style={{ width: AGENT_RAIL_WIDTH, transform: open ? "translateX(0)" : "translateX(-100%)" }}
      >
        <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 font-medium text-sm shrink-0">
          Agents ({agents.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {agents.length === 0 ? (
            <div className="px-4 py-6 text-sm text-black/50 dark:text-white/50">
              No agents yet — create one in the Builder.
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {agents.map((a) => {
                const selected = a.id === selectedId;
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => onSelect(a.id)}
                      className={
                        "w-full text-left px-4 py-3 text-sm flex items-center justify-between gap-2 " +
                        (selected
                          ? "bg-black/[0.04] dark:bg-white/[0.06]"
                          : "hover:bg-black/[0.02] dark:hover:bg-white/[0.04]")
                      }
                    >
                      <span className="min-w-0">
                        <span className={"block truncate " + (selected ? "font-medium" : "")}>{a.name}</span>
                        {!a.vapi_assistant_id && (
                          <span className="block text-[11px] text-black/40 dark:text-white/40 mt-0.5">
                            not compiled
                          </span>
                        )}
                      </span>
                      {selected && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
