import { RealVapiClient } from "@/lib/compiler/vapiClient";
import { syncSpecToVapi } from "@/lib/compiler/compile";
import { createAgentWithSpec, getAgent, updateAgentSpec } from "@/lib/db/repositories/agents";
import { env } from "@/lib/env";
import { diffSpecs } from "../diff";
import type { BuilderState } from "../state";

/**
 * compiler node — runs ONCE after the editor loop settles (never per tool call).
 * Deterministic: validate → build → PATCH/POST → persist the spec in place.
 * Skips the Vapi write when nothing changed.
 */
export async function compilerNode(state: BuilderState): Promise<Partial<BuilderState>> {
  if (!state.changed) {
    return { diff: diffSpecs(state.prevSpec, state.workingSpec) };
  }

  const spec = state.workingSpec;

  // Editing an existing agent → PATCH the same assistant, don't create a new one.
  if (state.agentId && !spec.vapiAssistantId) {
    const agent = await getAgent(state.agentId);
    if (agent?.vapi_assistant_id) spec.vapiAssistantId = agent.vapi_assistant_id;
  }

  const { assistantId, vapiObject, spec: synced } = await syncSpecToVapi(
    spec,
    new RealVapiClient(),
    { baseUrl: env.baseUrl() },
  );

  const compiledPrompt = vapiObject.model.messages[0].content;

  if (state.agentId) {
    await updateAgentSpec(state.agentId, synced, assistantId);
    return {
      assistantId,
      workingSpec: synced,
      compiledPrompt,
      diff: diffSpecs(state.prevSpec, synced),
    };
  }

  const created = await createAgentWithSpec(synced, assistantId);
  return {
    agentId: created.agentId,
    assistantId,
    workingSpec: synced,
    compiledPrompt,
    diff: diffSpecs(state.prevSpec, synced),
  };
}
