/**
 * Cheap validation of the eval harness: generate the spec-grounded persona plan
 * for the latest agent and run 2 representative slots (the qualified anchor + a
 * guardrail probe if one exists, else the unqualified anchor). Does NOT persist.
 * Run: npm run eval:smoke
 */
import { getCurrentSpec, listAgents } from "../src/lib/db/repositories/agents";
import { evaluateCase } from "../src/lib/evals/runner";
import { buildCasePlan } from "../src/lib/evals/casePlan";
import { fleshOutPersonas } from "../src/lib/evals/personaGen";

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
    `Agent "${agent.name}" · actions=[${spec.actions.join(", ")}] · criteria=[${spec.qualification.criteria
      .map((c) => `${c.field}${c.gate ? "(gate)" : ""}`)
      .join(", ")}] · pass=${spec.qualification.scoring.passScore}`,
  );

  const plan = buildCasePlan(spec);
  const personas = await fleshOutPersonas(spec, plan);
  const probe = personas.find((p) => p.guardrailProbe);
  const picks = [
    personas.find((p) => p.id === "qualified-anchor")!,
    probe ?? personas.find((p) => p.id === "unqualified-anchor")!,
  ];

  for (const p of picks) {
    console.log(`\n[${p.id}] ${p.name} @ ${p.company} — ${p.brief}`);
    const r = await evaluateCase(spec, p);
    console.log(`  passed=${r.passed}`);
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
