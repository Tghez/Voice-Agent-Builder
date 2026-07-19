"use client";

import type { AgentSpec } from "@/lib/spec/schema";
import { AgentsPanel } from "./AgentsPanel";
import { RAIL_WIDTH } from "./constants";
import { PromptPanel } from "./PromptPanel";
import { SpecCard } from "./SpecCard";
import type { AgentOption } from "./types";

export type TabId = "agents" | "identity" | "prompt";

const TABS: { id: TabId; label: string }[] = [
  { id: "agents", label: "Agents" },
  { id: "identity", label: "Identity" },
  { id: "prompt", label: "Prompt" },
];

interface RightRailProps {
  agents: AgentOption[];
  agentId: string | null;
  spec: AgentSpec | null;
  compiledPrompt: string | null;
  onSelectAgent: (id: string) => void;
  onNewAgent: () => void;
  open: boolean;
  onToggle: () => void;
  tab: TabId;
  onTabChange: (tab: TabId) => void;
}

/** A fixed top-right toggle button opens/closes a panel occupying
 *  `RAIL_WIDTH` of the viewport, with a horizontal, click-to-switch tab bar
 *  inside — the chat area (Hero/Composer/MessagesView) shrinks to fill the
 *  remaining width in lockstep, driven by the same `open` boolean lifted to
 *  the page. `tab`/`onTabChange` are lifted too, so the page can force the
 *  panel to the Identity tab after a builder edit completes. */
export function RightRail({
  agents,
  agentId,
  spec,
  compiledPrompt,
  onSelectAgent,
  onNewAgent,
  open,
  onToggle,
  tab,
  onTabChange,
}: RightRailProps) {
  return (
    <>
      <button
        onClick={onToggle}
        title={open ? "Close panel" : "Open panel"}
        aria-label={open ? "Close panel" : "Open panel"}
        aria-pressed={open}
        className={
          "fixed top-2.5 right-4 z-50 grid place-items-center h-9 w-9 rounded-lg border transition-colors cursor-pointer backdrop-blur " +
          (open
            ? "border-black/15 dark:border-white/20 bg-black/5 dark:bg-white/10 text-black dark:text-white"
            : "border-black/10 dark:border-white/15 bg-white/90 dark:bg-neutral-900/90 text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white")
        }
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="15" y1="4" x2="15" y2="20" />
        </svg>
      </button>

      <div
        className="fixed top-14 bottom-0 right-0 z-40 border-l border-black/10 dark:border-white/10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-xl flex flex-col transition-transform duration-300 ease-out"
        style={{ width: RAIL_WIDTH, transform: open ? "translateX(0)" : "translateX(100%)" }}
      >
        <div className="flex border-b border-black/10 dark:border-white/10 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={
                "flex-1 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer " +
                (tab === t.id
                  ? "text-black dark:text-white border-b-2 border-black dark:border-white"
                  : "text-black/45 dark:text-white/45 hover:text-black dark:hover:text-white")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "agents" && <AgentsPanel agents={agents} agentId={agentId} onSelect={onSelectAgent} onNew={onNewAgent} />}
          {tab === "identity" && <SpecCard spec={spec} />}
          {tab === "prompt" && <PromptPanel compiledPrompt={compiledPrompt} />}
        </div>
      </div>
    </>
  );
}
