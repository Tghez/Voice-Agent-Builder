import { serviceClient } from "@/lib/db/client";

export interface EvalCaseInput {
  persona: string;
  transcript: unknown;
  scores: Record<string, unknown>;
  passed: boolean;
  judge_notes: string;
}

export interface EvalRunRow {
  id: string;
  agent_id: string | null;
  spec_version: number | null;
  summary: Record<string, unknown> | null;
  created_at: string;
}

export async function insertRun(
  agentId: string,
  specVersion: number,
  summary: Record<string, unknown>,
): Promise<string> {
  const db = serviceClient();
  const { data, error } = await db
    .from("eval_runs")
    .insert({ agent_id: agentId, spec_version: specVersion, summary })
    .select()
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

export async function insertCases(runId: string, cases: EvalCaseInput[]): Promise<void> {
  const db = serviceClient();
  const rows = cases.map((c) => ({ run_id: runId, ...c }));
  const { error } = await db.from("eval_cases").insert(rows);
  if (error) throw error;
}

export async function listRuns(agentId?: string): Promise<EvalRunRow[]> {
  const db = serviceClient();
  let q = db.from("eval_runs").select("*").order("created_at", { ascending: false }).limit(20);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EvalRunRow[];
}
