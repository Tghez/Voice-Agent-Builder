import type { BuilderState } from "../state";

/**
 * test_runner — stages a test call. It does NOT place the call itself: the hard
 * confirmation gate + lead selection live in the UI, which calls /api/calls with
 * confirm:true. This keeps "place a call" behind an explicit user action.
 */
export async function testRunnerNode(_state: BuilderState): Promise<Partial<BuilderState>> {
  return {
    reply:
      "Ready to place a test call with this agent. Pick a lead and confirm — I'll dial your demo number (~$0.13/min, a real call).",
    testCall: { note: "awaiting lead selection + confirm" },
    done: true,
  };
}
