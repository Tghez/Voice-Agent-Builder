"use client";

import { useSyncExternalStore } from "react";
import type { EvalSummary } from "@/lib/evals/types";

/**
 * Client-side run store for the eval harness. A run is a long two-phase POST
 * (prepare → run) that must OUTLIVE the evals page: the user can navigate to the
 * dashboard mid-run and come back, and the harness keeps going. Component state
 * would be lost on unmount, so the status lives here at module scope instead and
 * both the evals page and the nav subscribe via `useEvalRun()`.
 *
 * (Module scope survives client navigation, not a full browser reload — the
 * blocking POST can't be reattached after a reload, so we don't pretend to.)
 */

export type EvalStatus = "idle" | "generating" | "running" | "done" | "error";

export interface EvalRunState {
  status: EvalStatus;
  agentId: string | null;
  agentName: string | null;
  /** epoch ms when the current run started — drives the elapsed timer. */
  startedAt: number | null;
  error: string | null;
  /** Summary of the just-finished run (tagged to `agentId`). */
  latest: EvalSummary | null;
}

const INITIAL: EvalRunState = {
  status: "idle",
  agentId: null,
  agentName: null,
  startedAt: null,
  error: null,
  latest: null,
};

let state: EvalRunState = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function set(patch: Partial<EvalRunState>) {
  state = { ...state, ...patch };
  emit();
}

export function isEvalRunning(s: EvalRunState): boolean {
  return s.status === "generating" || s.status === "running";
}

/** Kick off a run. No-ops if one is already in flight (single run at a time). */
export async function runEvaluation(agentId: string, agentName: string): Promise<void> {
  if (isEvalRunning(state)) return;
  set({
    status: "generating",
    agentId,
    agentName,
    startedAt: Date.now(),
    error: null,
    latest: null,
  });

  try {
    // Phase 1 — ensure the golden persona set is current (the only LLM-gen step).
    const prep = await fetch("/api/evals/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    }).then((r) => r.json());
    if (prep?.error) {
      set({ status: "error", error: prep.error });
      return;
    }

    // Phase 2 — run the conversations.
    set({ status: "running" });
    const data = await fetch("/api/evals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    }).then((r) => r.json());
    if (data?.error) {
      set({ status: "error", error: data.error });
      return;
    }

    set({ status: "done", latest: data as EvalSummary });
  } catch (e) {
    set({ status: "error", error: (e as Error).message });
  }
}

export function dismissEvalError() {
  if (state.status === "error") set({ status: "idle", error: null });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return state;
}
function getServerSnapshot() {
  return INITIAL;
}

export function useEvalRun(): EvalRunState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
