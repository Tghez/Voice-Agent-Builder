/**
 * Tier-1 builder-eval harness — evaluates the BUILDER (the NL → AgentSpec graph),
 * not the generated voice agent (that's `npm run eval:*`).
 *
 * Two objective tracks, no LLM judge:
 *   1. router — turn classification + needsClarification vs hand-authored gold labels.
 *   2. edit   — one NL instruction against a known spec; asserts the deterministic
 *               diff is SURGICAL (intended fields change, the rest don't).
 *
 * Side-effect-free: runs a compiler-less mirror of the builder graph, so no Vapi
 * assistant is PATCHed and no DB row is written. Set LANGSMITH_TRACING=true to see
 * every case as a nested trace in the `builder-eval` LangSmith project.
 *
 * Run: npm run eval:builder      (exits non-zero if any case fails)
 */
import { ALL_CASES } from "../src/lib/builder-eval/cases";
import { flushTraces, langsmithProject, runBuilderEval, type CaseResult } from "../src/lib/builder-eval/runner";

function line(r: CaseResult): string {
  const mark = r.passed ? "PASS" : "FAIL";
  return `  [${mark}] ${r.id.padEnd(28)} ${r.detail}`;
}

async function main() {
  const tracing = process.env.LANGSMITH_TRACING === "true";
  console.log(
    `Builder eval (tier 1) · ${ALL_CASES.length} cases · LangSmith ${tracing ? `ON → project "${langsmithProject}"` : "off (set LANGSMITH_TRACING=true to trace)"}\n`,
  );

  const report = await runBuilderEval(ALL_CASES);

  console.log("Router track (classification + clarification):");
  for (const r of report.results.filter((x) => x.kind === "router")) console.log(line(r));
  console.log(`\nEdit track (surgical-ness):`);
  for (const r of report.results.filter((x) => x.kind === "edit")) console.log(line(r));

  console.log(
    `\nRouter: ${report.routerPassed}/${report.routerTotal}  ·  Edit: ${report.editPassed}/${report.editTotal}  ·  ` +
      `Overall: ${report.routerPassed + report.editPassed}/${report.results.length}`,
  );

  // Surface each failure's intent so a red run is self-explaining in the meeting.
  const failures = report.results.filter((r) => !r.passed);
  if (failures.length) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(`  ✗ ${f.id} — ${f.note}`);
  }

  // Deliver the traces BEFORE exiting — otherwise the background batch queue is
  // killed mid-flight and nothing reaches LangSmith.
  if (tracing) {
    process.stdout.write("\nFlushing traces to LangSmith… ");
    await flushTraces();
    console.log(`done → project "${langsmithProject}".`);
  }

  process.exit(report.allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("Builder eval crashed:", e?.message ?? e);
  process.exit(1);
});
