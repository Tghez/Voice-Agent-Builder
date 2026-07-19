import type { BuilderState } from "../state";

/**
 * test_runner — stages a test call. It does NOT place the call itself: the hard
 * confirmation gate + lead selection live in the UI, which calls /api/calls with
 * confirm:true. This keeps "place a call" behind an explicit user action. The
 * user-facing reply is phrased and streamed by responder, which this node
 * flows into next.
 */
export async function testRunnerNode(_state: BuilderState): Promise<Partial<BuilderState>> {
  return { testCall: { note: "awaiting lead selection + confirm" } };
}
