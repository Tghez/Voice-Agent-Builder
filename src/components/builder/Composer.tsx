"use client";

import { useEffect, useRef } from "react";
import { RAIL_WIDTH } from "./constants";

interface ComposerProps {
  started: boolean;
  panelOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

/** The pill-shaped input. Always mounted at the same DOM position so typed
 *  text/focus survive the transition; only its `transform` (computed inline
 *  from `started`/`panelOpen`) animates it between screen-center and
 *  docked-at-bottom, and re-centers within the right 80% when the left
 *  panel is open. */
export function Composer({ started, panelOpen, value, onChange, onSubmit, loading }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const x = panelOpen ? `calc(-50% + (${RAIL_WIDTH}) / 2)` : "-50%";
  const y = started ? "calc(100vh - 112px)" : "calc(42vh - 32px)";

  return (
    <div
      className="fixed left-1/2 top-0 z-30 w-full max-w-2xl px-4 transition-transform duration-[400ms] ease-in-out"
      style={{ transform: `translate(${x}, ${y})` }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-end gap-2 rounded-3xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-lg shadow-black/5 dark:shadow-black/30 px-3 py-2.5"
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Describe your agent, and I'll bring it to life"
          rows={1}
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40 max-h-[200px] overflow-y-auto"
        />

        <button
          type="submit"
          disabled={loading || !value.trim()}
          aria-label="Send"
          className="shrink-0 grid place-items-center h-9 w-9 rounded-full bg-black text-white dark:bg-white dark:text-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:opacity-80 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}
