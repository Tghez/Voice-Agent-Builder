import { AgentSpecSchema, type AgentSpec } from "@/lib/spec/schema";
import { buildVapiAssistant, type BuildOptions } from "./vapiMap";
import type { VapiClient } from "./vapiClient";

/**
 * The compiler node — deterministic, the single point of Vapi coupling.
 *
 * Steps:
 *  1. Validate (AgentSpecSchema.parse) — the airlock. A hallucinated field
 *     cannot reach the live agent.
 *  2. Build the Vapi Assistant object (pure, byte-identical per spec).
 *  3. Sync: PATCH if we already have an assistant id, else POST.
 *
 * Persisting the updated spec + vapiAssistantId is the caller's job (db
 * layer) — this function stays free of storage concerns.
 */

export interface SyncResult {
  assistantId: string;
  /** The exact object sent to Vapi (useful for the "view compiled prompt" UI + tests). */
  vapiObject: ReturnType<typeof buildVapiAssistant>;
  /** The validated spec with vapiAssistantId populated. */
  spec: AgentSpec;
}

export async function syncSpecToVapi(
  spec: AgentSpec,
  client: VapiClient,
  opts: BuildOptions,
): Promise<SyncResult> {
  // 1. Airlock — reject malformed spec before any Vapi call.
  const valid = AgentSpecSchema.parse(spec);

  // 2. Deterministic build.
  const vapiObject = buildVapiAssistant(valid, opts);

  // 3. Sync.
  const ref = valid.vapiAssistantId
    ? await client.updateAssistant(valid.vapiAssistantId, vapiObject)
    : await client.createAssistant(vapiObject);

  return {
    assistantId: ref.id,
    vapiObject,
    spec: { ...valid, vapiAssistantId: ref.id },
  };
}

export { buildVapiAssistant };
