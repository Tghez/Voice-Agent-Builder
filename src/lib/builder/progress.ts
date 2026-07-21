import type { SpecSection } from "@/lib/spec/apply";

/**
 * Live builder progress — the editor and compiler are otherwise-silent nodes
 * that can take several seconds (LLM tool loop + Vapi PATCH). They push these
 * status updates onto the graph's "custom" stream channel so the chat can show
 * a real, moving checklist instead of a fake timer. A `status` chunk is an
 * OBJECT (`kind: "status"`), which the API route routes to a separate SSE
 * `status` event — distinct from the string text tokens the responder emits,
 * so progress text never leaks into the assistant's reply.
 *
 * `write` is whatever `getWriter()` returned in the node (a function, or
 * undefined outside a stream — e.g. `.invoke()` in scripts, where this no-ops).
 */

export interface BuilderStatus {
  kind: "status";
  label: string;
  /** true = terminal/done step (renders checked even when it's the last one). */
  done?: boolean;
}

export function emitStatus(write: unknown, label: string, done = false): void {
  if (typeof write === "function") {
    (write as (chunk: BuilderStatus) => void)({ kind: "status", label, done });
  }
}

/** Friendly progress label per spec section the editor just wrote. */
export const SECTION_STATUS: Record<SpecSection, string> = {
  identity: "Updating identity & voice",
  qualification: "Setting qualification criteria",
  actions: "Configuring actions",
  goal: "Setting the call goal",
  guardrails: "Updating guardrails",
};
