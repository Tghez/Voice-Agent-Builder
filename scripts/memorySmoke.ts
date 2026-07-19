/**
 * Verify the graph now has session memory: the clarifier asks a question (turn 1),
 * the user answers (turn 2), and the clarifier must NOT re-ask — it proceeds using
 * the answer. Turn 3 is a follow-up that references prior context.
 * Run: npm run memory:smoke
 */
import { builderGraph } from "../src/lib/builder/graph";
import { emptySpec, type AgentSpec } from "../src/lib/spec/schema";
import { getAgent, getCurrentSpec } from "../src/lib/db/repositories/agents";
import type { ChatTurn } from "../src/lib/builder/state";

const history: ChatTurn[] = [];
let agentId: string | undefined;

async function turn(message: string) {
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

  const r = await builderGraph.invoke({
    userMessage: message,
    history: [...history],
    agentId,
    workingSpec,
    prevSpec,
  });

  console.log(`\n> ${message}`);
  console.log(`  route=${r.route}  agentId=${r.agentId ?? "-"}`);
  if (r.toolLog?.length) console.log(`  edits: ${r.toolLog.join(", ")}`);
  console.log(`  reply: ${r.reply}`);

  history.push({ role: "user", content: message });
  history.push({ role: "assistant", content: r.reply ?? "" });
  if (r.agentId) agentId = r.agentId;
  return r;
}

async function main() {
  await turn("I want an agent named Nova that qualifies leads and books a demo if they qualify.");
  await turn("Qualify on team size of at least 20 and that they have budget approved this quarter.");
  await turn("Actually make the team size threshold 15 instead.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Memory smoke failed:", e.message ?? e);
    process.exit(1);
  });
