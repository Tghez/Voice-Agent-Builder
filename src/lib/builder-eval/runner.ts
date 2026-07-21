import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";
import { diffSpecs } from "@/lib/builder/diff";
import type { AgentSpec } from "@/lib/spec/schema";
import { builderEvalGraph } from "./graph";
import { fixture, type BuilderEvalCase, type EditCase, type RouterCase } from "./cases";

/**
 * Tier-1 builder-eval runner. Each case runs through `builderEvalGraph`
 * (router → maybe editor, NO compiler), so it's side-effect-free — no Vapi
 * PATCH, no DB write. Ground truth is objective (router gold labels + a
 * deterministic spec diff), so there is no LLM judge here.
 *
 * Every case is wrapped in a LangSmith `traceable` named `builder-eval:<id>` and
 * pinned to the `builder-eval` project, so the whole tier is one findable set of
 * nested traces (router + editor tool-loop underneath). When LANGSMITH_TRACING
 * is unset the wrapper is a silent no-op.
 */

/**
 * One explicit LangSmith client, shared by every case's traceable (and inherited
 * by the nested Anthropic runs). We hold the reference so the CLI can flush it
 * before exiting — otherwise `process.exit()` kills the process while runs are
 * still sitting in the background batch queue and they never reach LangSmith.
 * Reads LANGSMITH_API_KEY / LANGSMITH_ENDPOINT from the environment.
 */
const lsClient = new Client();

/** The project runs land in — the env's LANGSMITH_PROJECT (LangSmith's own default). */
export const langsmithProject = process.env.LANGSMITH_PROJECT ?? "default";

/** Drain the batch queue so a short-lived script actually delivers its traces. */
export async function flushTraces(): Promise<void> {
  await lsClient.awaitPendingTraceBatches();
}

export interface CaseResult {
  id: string;
  kind: BuilderEvalCase["kind"];
  passed: boolean;
  /** One-line, human-readable outcome (what was expected vs seen). */
  detail: string;
  note: string;
}

/** Run one case through the graph, traced. Returns the final graph state. */
function invokeTraced(c: BuilderEvalCase) {
  const working: AgentSpec = fixture(c.spec);
  const run = traceable(
    (input: Parameters<typeof builderEvalGraph.invoke>[0]) => builderEvalGraph.invoke(input),
    // No project_name → runs land in the env's LANGSMITH_PROJECT (LangSmith default).
    { name: `builder-eval:${c.id}`, run_type: "chain", client: lsClient },
  );
  return run({
    userMessage: c.message,
    history: c.history ?? [],
    agentId: undefined,
    workingSpec: working,
    prevSpec: null,
  });
}

async function runRouterCase(c: RouterCase): Promise<CaseResult> {
  const final = await invokeTraced(c);
  const route = final.route;
  const clar = final.needsClarification ?? false;

  const routeOk = route === c.expectRoute;
  const clarOk = c.expectClarify === undefined || clar === c.expectClarify;
  const passed = routeOk && clarOk;

  const clarExpected = c.expectClarify === undefined ? "" : `, clarify ${c.expectClarify}`;
  const clarActual = c.expectClarify === undefined ? "" : `, clarify ${clar}`;
  return {
    id: c.id,
    kind: "router",
    passed,
    detail: `expected route ${c.expectRoute}${clarExpected} · got ${route}${clarActual}`,
    note: c.note,
  };
}

async function runEditCase(c: EditCase): Promise<CaseResult> {
  const before = fixture(c.spec);
  // invokeTraced instantiates its own fresh working spec and mutates it in place.
  const final = await invokeTraced(c);

  // Guard: the case only makes sense if the router actually reached the editor.
  if (final.route !== "edit" || final.needsClarification) {
    return {
      id: c.id,
      kind: "edit",
      passed: false,
      detail: `router did not reach editor (route ${final.route}, clarify ${final.needsClarification ?? false})`,
      note: c.note,
    };
  }

  const diff = diffSpecs(before, final.workingSpec);
  const changed = new Set(diff.changes.map((ch) => ch.path));

  const missing = c.mustChange.filter((p) => !changed.has(p));
  const leaked = c.mustNotChange.filter((p) => changed.has(p));
  const passed = missing.length === 0 && leaked.length === 0;

  const problems: string[] = [];
  if (missing.length) problems.push(`did not change [${missing.join(", ")}]`);
  if (leaked.length) problems.push(`collaterally changed [${leaked.join(", ")}]`);
  return {
    id: c.id,
    kind: "edit",
    passed,
    detail: passed
      ? `surgical — changed [${[...changed].join(", ") || "nothing"}]`
      : problems.join("; "),
    note: c.note,
  };
}

export function runCase(c: BuilderEvalCase): Promise<CaseResult> {
  return c.kind === "router" ? runRouterCase(c) : runEditCase(c);
}

export interface EvalReport {
  results: CaseResult[];
  routerTotal: number;
  routerPassed: number;
  editTotal: number;
  editPassed: number;
  allPassed: boolean;
}

/** Run cases sequentially (stable ordering, modest token bursts). */
export async function runBuilderEval(cases: BuilderEvalCase[]): Promise<EvalReport> {
  const results: CaseResult[] = [];
  for (const c of cases) results.push(await runCase(c));

  const router = results.filter((r) => r.kind === "router");
  const edit = results.filter((r) => r.kind === "edit");
  return {
    results,
    routerTotal: router.length,
    routerPassed: router.filter((r) => r.passed).length,
    editTotal: edit.length,
    editPassed: edit.filter((r) => r.passed).length,
    allPassed: results.every((r) => r.passed),
  };
}
