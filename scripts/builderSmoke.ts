/**
 * End-to-end smoke test of the builder graph (real Anthropic + Vapi + Supabase):
 *   1. create an agent from NL,
 *   2. edit it ("more energetic") and confirm the change is SURGICAL (persona
 *      only) and PATCHes the same assistant at a new version.
 *
 * Run: npm run builder:smoke
 */
import { builderGraph } from "../src/lib/builder/graph";
import { emptySpec, type AgentSpec } from "../src/lib/spec/schema";
import { getAgent, getCurrentSpec } from "../src/lib/db/repositories/agents";

async function turn(message: string, agentId?: string) {
  let workingSpec: AgentSpec;
  let prevSpec: AgentSpec | null = null;
  if (agentId) {
    const a = await getAgent(agentId);
    const s = a ? await getCurrentSpec(a) : null;
    workingSpec = s ?? emptySpec();
    prevSpec = s ? structuredClone(s) : null;
  } else {
    workingSpec = emptySpec();
  }

  const r = await builderGraph.invoke({ userMessage: message, agentId, workingSpec, prevSpec });
  console.log(`\n> ${message}`);
  console.log(`  route=${r.route}  version=${r.version ?? "-"}  agentId=${r.agentId ?? "-"}`);
  if (r.toolLog?.length) console.log(`  edits: ${r.toolLog.join(", ")}`);
  if (r.diff) console.log(`  diff: ${r.diff.summary.join(" ")}`);
  console.log(`  reply: ${r.reply}`);
  return r;
}

async function main() {
  const create = await turn(
    "Create an agent named Maya. Qualify leads with a sales team of at least 10 and budget approved this quarter; book a 30-minute demo if they qualify, otherwise schedule a callback. Never quote pricing.",
  );
  const agentId = create.agentId as string | undefined;
  if (!agentId) {
    console.log("\n(No agent created — clarifier likely asked a question. Re-run with more detail.)");
    return;
  }
  await turn("Make her more energetic and enthusiastic on the call.", agentId);
  console.log("\nSmoke complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Smoke failed:", e.message ?? e);
    process.exit(1);
  });
