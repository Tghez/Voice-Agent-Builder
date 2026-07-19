import type { AgentSpec } from "@/lib/spec/schema";
import { serviceClient } from "@/lib/db/client";
import type { AgentRow } from "@/lib/db/types";

/**
 * Agents: one live spec per agent, updated in place on every edit. All
 * Vapi-agnostic; the compiler owns Vapi.
 */

/** Create a brand-new agent with its spec. */
export async function createAgentWithSpec(
  spec: AgentSpec,
  assistantId: string,
): Promise<{ agentId: string }> {
  const db = serviceClient();
  const { data: agent, error } = await db
    .from("agents")
    .insert({ name: spec.identity.name, spec, vapi_assistant_id: assistantId })
    .select()
    .single<AgentRow>();
  if (error) throw error;
  return { agentId: agent.id };
}

/** Overwrite an existing agent's spec in place. */
export async function updateAgentSpec(
  agentId: string,
  spec: AgentSpec,
  assistantId: string,
): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from("agents")
    .update({ name: spec.identity.name, spec, vapi_assistant_id: assistantId })
    .eq("id", agentId);
  if (error) throw error;
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
  return agent.spec ?? null;
}

export async function listAgents(): Promise<AgentRow[]> {
  const db = serviceClient();
  const { data, error } = await db.from("agents").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AgentRow[];
}
