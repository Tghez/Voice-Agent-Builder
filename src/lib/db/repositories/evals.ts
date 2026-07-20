import { serviceClient } from "@/lib/db/client";
import type { Persona, EvalCaseScores, Turn } from "@/lib/evals/types";

export interface EvalCaseInput {
  /** Optional explicit row id — set so the run summary can reference the case before insert. */
  id?: string;
  /** Full persona object used for this run (jsonb) — immune to later golden-set regeneration. */
  persona: Persona;
  transcript: Turn[];
  scores: EvalCaseScores;
  passed: boolean;
  judge_notes: string;
}

export interface EvalRunRow {
  id: string;
  agent_id: string | null;
  summary: Record<string, unknown> | null;
  created_at: string;
}

export interface EvalCaseRow {
  id: string;
  run_id: string;
  persona: Persona | null;
  transcript: Turn[];
  scores: EvalCaseScores;
  passed: boolean;
  judge_notes: string;
  created_at: string;
}

export async function insertRun(
  agentId: string,
  summary: Record<string, unknown>,
): Promise<string> {
  const db = serviceClient();
  const { data, error } = await db
    .from("eval_runs")
    .insert({ agent_id: agentId, summary })
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

export async function getCase(caseId: string): Promise<EvalCaseRow | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("eval_cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle<EvalCaseRow>();
  if (error) throw error;
  return data;
}

export async function listRuns(agentId?: string): Promise<EvalRunRow[]> {
  const db = serviceClient();
  let q = db.from("eval_runs").select("*").order("created_at", { ascending: false }).limit(20);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EvalRunRow[];
}
