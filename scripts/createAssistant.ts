/**
 * Day-1 milestone: a hand-written AgentSpec compiles to a REAL Vapi assistant
 * and is persisted as agent + agent_specs(version 1).
 *
 * Run: npm run assistant:create
 */
import { serviceClient } from "../src/lib/db/client";
import { RealVapiClient } from "../src/lib/compiler/vapiClient";
import { syncSpecToVapi } from "../src/lib/compiler/compile";
import { AgentSpecSchema, type AgentSpec } from "../src/lib/spec/schema";
import { baseUrl } from "../src/lib/config";

function sampleSpec(): AgentSpec {
  return AgentSpecSchema.parse({
    identity: {
      name: "Maya",
      persona:
        "A warm, concise sales development rep for Alta. Friendly and curious, never pushy.",
      voice: "friendly-female",
      firstMessage: "Hi, this is Maya from Alta — do you have a quick minute?",
    },
    goal:
      "Qualify the lead against the criteria and, if they qualify, book a 30-minute demo.",
    qualification: {
      criteria: [
        { field: "team_size", op: ">=", value: 10, weight: 2, gate: true, label: "Sales team of at least 10" },
        { field: "has_budget", op: "==", value: true, weight: 1, gate: false, label: "Has budget approved this quarter" },
      ],
      scoring: { mode: "weighted", passScore: 60 },
    },
    actions: ["qualify_lead", "check_availability", "book_meeting", "schedule_callback"],
    guardrails: [
      "Never quote specific pricing.",
      "Never promise anything you cannot confirm.",
      "Keep responses short and natural — this is a phone call.",
    ],
    version: 1,
  });
}

async function main() {
  const spec = sampleSpec();
  const client = new RealVapiClient();

  const { assistantId, vapiObject, spec: synced } = await syncSpecToVapi(spec, client, {
    baseUrl: baseUrl(),
  });

  const db = serviceClient();
  const { data: agent, error: aerr } = await db
    .from("agents")
    .insert({ name: synced.identity.name, current_version: synced.version, vapi_assistant_id: assistantId })
    .select()
    .single();
  if (aerr) throw aerr;

  const { error: serr } = await db
    .from("agent_specs")
    .insert({ agent_id: agent.id, version: synced.version, spec: synced, vapi_assistant_id: assistantId });
  if (serr) throw serr;

  console.log("Milestone reached: spec -> real Vapi assistant");
  console.log("  assistantId:", assistantId);
  console.log("  agentId:    ", agent.id);
  console.log("  tools:      ", vapiObject.model.tools.map((t) => t.function.name).join(", "));
  console.log("  compiled prompt (head):");
  console.log(
    vapiObject.model.messages[0].content.slice(0, 320).replace(/^/gm, "    "),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Failed:", e.message ?? e);
    process.exit(1);
  });
