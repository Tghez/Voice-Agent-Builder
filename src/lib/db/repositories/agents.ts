import type { AgentSpec } from "@/lib/spec/schema";
import { serviceClient } from "@/lib/db/client";
import type { AgentRow, AgentSpecRow } from "@/lib/db/types";

/**
 * Agents + versioned specs. Every spec edit appends a new agent_specs row and
 * bumps agents.current_version — history, rollback, and eval-to-version tying all
 * fall out of this. All Vapi-agnostic; the compiler owns Vapi.
 */

/** Create a brand-new agent at version 1 with its first spec. */
export async function createAgentWithSpec(
  spec: AgentSpec,
  assistantId: string,
): Promise<{ agentId: string; version: number }> {
  const db = serviceClient();
  const version = spec.version || 1;

  const { data: agent, error: aerr } = await db
    .from("agents")
    .insert({ name: spec.identity.name, current_version: version, vapi_assistant_id: assistantId })
    .select()
    .single<AgentRow>();
  if (aerr) throw aerr;

  const { error: serr } = await db
    .from("agent_specs")
    .insert({ agent_id: agent.id, version, spec, vapi_assistant_id: assistantId });
  if (serr) throw serr;

  return { agentId: agent.id, version };
}

/** Append a new spec version to an existing agent and make it current. */
export async function addSpecVersion(
  agentId: string,
  spec: AgentSpec,
  assistantId: string,
): Promise<number> {
  const db = serviceClient();
  const current = await getAgent(agentId);
  if (!current) throw new Error(`agent ${agentId} not found`);
  const version = current.current_version + 1;

  const specToStore = { ...spec, version };
  const { error: serr } = await db
    .from("agent_specs")
    .insert({ agent_id: agentId, version, spec: specToStore, vapi_assistant_id: assistantId });
  if (serr) throw serr;

  const { error: uerr } = await db
    .from("agents")
    .update({ current_version: version, vapi_assistant_id: assistantId })
    .eq("id", agentId);
  if (uerr) throw uerr;

  return version;
}

export async function getAgent(id: string): Promise<AgentRow | null> {
  const db = serviceClient();
  const { data, error } = await db.from("agents").select("*").eq("id", id).maybeSingle<AgentRow>();
  if (error) throw error;
  return data;
}

export async function getAgentByAssistantId(assistantId: string): Promise<AgentRow | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("agents")
    .select("*")
    .eq("vapi_assistant_id", assistantId)
    .maybeSingle<AgentRow>();
  if (error) throw error;
  return data;
}

export async function getCurrentSpec(agent: AgentRow): Promise<AgentSpec | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("agent_specs")
    .select("*")
    .eq("agent_id", agent.id)
    .eq("version", agent.current_version)
    .maybeSingle<AgentSpecRow>();
  if (error) throw error;
  return data?.spec ?? null;
}

export async function listAgents(): Promise<AgentRow[]> {
  const db = serviceClient();
  const { data, error } = await db.from("agents").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AgentRow[];
}
