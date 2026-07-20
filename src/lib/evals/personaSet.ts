import type { AgentSpec } from "@/lib/spec/schema";
import type { AgentRow } from "@/lib/db/types";
import { savePersonaSet } from "@/lib/db/repositories/agents";
import { buildCasePlan } from "./casePlan";
import { fleshOutPersonas, specHashForPersonaSet } from "./personaGen";
import type { Persona } from "./types";

/**
 * Golden-set persistence (option 4). One persisted persona set per agent, reused
 * across runs for comparable results, and regenerated ONLY when the spec's
 * qualification-relevant surface changes. Staleness is checked lazily here (at
 * eval-run/prepare time) — nothing invalidates on spec-save.
 */
export async function getOrCreatePersonaSet(
  agent: AgentRow,
  spec: AgentSpec,
): Promise<{ personas: Persona[]; regenerated: boolean }> {
  const hash = specHashForPersonaSet(spec);
  if (agent.persona_set && agent.persona_set.length > 0 && agent.persona_set_spec_hash === hash) {
    return { personas: agent.persona_set, regenerated: false };
  }
  const plan = buildCasePlan(spec);
  const personas = await fleshOutPersonas(spec, plan);
  await savePersonaSet(agent.id, personas, hash);
  return { personas, regenerated: true };
}
