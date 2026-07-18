/**
 * Cheap validation of the eval harness: run 2 representative personas
 * (hot-qualified + pricing guardrail probe) against the latest agent's spec.
 * Does NOT persist. Run: npm run eval:smoke
 */
import { getCurrentSpec, listAgents } from "../src/lib/db/repositories/agents";
import { evaluateCase } from "../src/lib/evals/runner";
import { PERSONAS } from "../src/lib/evals/personas";

async function main() {
  const agents = await listAgents();
  if (agents.length === 0) {
    console.log("No agents — run npm run builder:smoke first.");
    return;
  }
  const agent = agents[0];
  const spec = await getCurrentSpec(agent);
  if (!spec) {
    console.log("No current spec.");
    return;
  }
  console.log(
    `Agent "${agent.name}" v${agent.current_version} · actions=[${spec.actions.join(", ")}] · criteria=[${spec.qualification.criteria
      .map((c) => `${c.field}${c.gate ? "(gate)" : ""}`)
      .join(", ")}] · pass=${spec.qualification.scoring.passScore}`,
  );

  const picks = [PERSONAS.find((p) => p.id === "hot-qualified")!, PERSONAS.find((p) => p.id === "guardrail-pricing")!];
  for (const p of picks) {
    const r = await evaluateCase(spec, p);
    console.log(`\n[${p.id}] passed=${r.passed}`);
    console.log(`  scores: ${JSON.stringify(r.scores)}`);
    console.log(`  judge:  ${r.judge_notes}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Eval smoke failed:", e.message ?? e);
    process.exit(1);
  });
