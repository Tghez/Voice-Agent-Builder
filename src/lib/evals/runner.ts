import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic } from "@/lib/llm/client";
import { env } from "@/lib/env";
import { renderPrompt } from "@/lib/compiler/renderPrompt";
import { runtimeToolDefsForSpec } from "@/lib/runtime/toolDefs";
import { dispatchTool, type ToolSession } from "@/lib/runtime/handlers";
import { MockCalendar } from "@/lib/providers/calendar";
import type { AgentSpec } from "@/lib/spec/schema";
import type { StructuredOutcome } from "@/lib/db/types";
import { PERSONAS, type Persona } from "./personas";
import { getAgent, getCurrentSpec } from "@/lib/db/repositories/agents";
import { insertRun, insertCases, type EvalCaseInput } from "@/lib/db/repositories/evals";

/**
 * Text-mode eval harness (Track B). LLM-as-lead roleplays a persona exchanging
 * TEXT turns with the agent, which runs on the SAME compiled prompt + SAME
 * runtime tools (executed for real via a ToolSession). Ground-truth
 * qualification comes from scoreFit on the persona's true attributes, so we can
 * check the agent's verdict deterministically; an LLM judge checks guardrails.
 * No telephony, cheap, many cases.
 */

type Turn = { role: "agent" | "lead"; text: string };

const MAX_LEAD_TURNS = 5;

function transcriptText(t: Turn[]): string {
  return t.map((x) => `${x.role === "agent" ? "Agent" : "Lead"}: ${x.text}`).join("\n");
}

async function leadReply(persona: Persona, transcript: Turn[]): Promise<string> {
  const resp = await getAnthropic().messages.create({
    model: env.builderModel(),
    max_tokens: 400,
    system: `You are roleplaying a sales LEAD on a phone call. Stay fully in character; you are NOT an assistant.
Persona: ${persona.name} at ${persona.company}.
Ground-truth facts you will reveal truthfully when asked: ${JSON.stringify(persona.attributes)}.
Style & behavior: ${persona.brief}
Keep replies short and natural (1-3 sentences), like a real phone call. Do not volunteer everything at once. When the call reaches a natural end (a meeting is booked, a callback is agreed, or you decline), say a brief goodbye.`,
    messages: [
      {
        role: "user",
        content: `Conversation so far:\n${transcriptText(transcript)}\n\nReply as ${persona.name} to the agent's latest message.`,
      },
    ],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

async function runConversation(
  spec: AgentSpec,
  persona: Persona,
): Promise<{ transcript: Turn[]; outcome: StructuredOutcome }> {
  // Agent sees only identity (name/company); it must EXTRACT attributes via the call.
  const leadContext = `Name: ${persona.name}\nCompany: ${persona.company}`;
  const system = renderPrompt(spec).replace("{{leadContext}}", leadContext);
  const tools = runtimeToolDefsForSpec(spec);

  const outcome: StructuredOutcome = {};
  const session: ToolSession = {
    qualification: spec.qualification,
    calendar: new MockCalendar(() => new Date("2026-07-20T09:00:00.000Z")),
    persistOutcome: async (patch) => {
      Object.assign(outcome, patch);
    },
  };

  const transcript: Turn[] = [{ role: "agent", text: spec.identity.firstMessage }];
  const agentMsgs: Anthropic.MessageParam[] = [];

  for (let turn = 0; turn < MAX_LEAD_TURNS; turn++) {
    const lead = await leadReply(persona, transcript);
    transcript.push({ role: "lead", text: lead });
    agentMsgs.push({ role: "user", content: lead });

    // Agent tool-calling loop for this turn.
    let agentText = "";
    for (let step = 0; step < 6; step++) {
      const resp = await getAnthropic().messages.create({
        model: env.incallModelSdk(),
        max_tokens: 1024,
        system,
        tools,
        messages: agentMsgs,
      });
      const texts = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ");
      if (texts) agentText += (agentText ? " " : "") + texts;

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      if (toolUses.length === 0) break;

      agentMsgs.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await dispatchTool(
          tu.name,
          tu.input as Record<string, unknown>,
          session,
        );
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      agentMsgs.push({ role: "user", content: results });
    }
    transcript.push({ role: "agent", text: agentText || "(no response)" });

    // Goal reached — stop early to save tokens.
    if (outcome.meeting_booked || outcome.callback_scheduled) break;
  }

  return { transcript, outcome };
}

const JudgeSchema = z.object({
  /** Should this lead qualify under the criteria given their TRUE facts? (semantic, name-agnostic) */
  expected_qualified: z.boolean(),
  /** Did the agent obey every guardrail? */
  guardrails_ok: z.boolean(),
  notes: z.string(),
});

async function judgeCase(
  spec: AgentSpec,
  persona: Persona,
  transcript: Turn[],
): Promise<{ expected_qualified: boolean; guardrails_ok: boolean; notes: string }> {
  const resp = await getAnthropic().messages.parse({
    model: env.builderModel(),
    max_tokens: 600,
    system: `You grade a simulated sales call. You are given the agent's qualification criteria, the lead's TRUE facts, the agent's guardrails, and the transcript.

1) expected_qualified: decide whether this lead SHOULD qualify under the criteria given their true facts. Map facts to criteria by MEANING, not exact field names (e.g. "40 reps" satisfies a "sales team size >= 10" criterion; a gate criterion that is not met means NOT qualified). Apply the pass rule (gates must all pass; then the pass score).
2) guardrails_ok: false if the agent violated ANY guardrail (e.g. quoted a specific price when told never to quote pricing, promised something it shouldn't). Otherwise true.
Give a one-sentence note explaining the key judgment.`,
    messages: [
      {
        role: "user",
        content: [
          `Criteria: ${JSON.stringify(spec.qualification.criteria)}`,
          `Scoring: ${JSON.stringify(spec.qualification.scoring)}`,
          `Lead TRUE facts: ${JSON.stringify(persona.attributes)}`,
          `Guardrails:\n- ${spec.guardrails.join("\n- ") || "(none)"}`,
          `\nTranscript:\n${transcriptText(transcript)}`,
        ].join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(JudgeSchema) },
  });
  return (
    resp.parsed_output ?? { expected_qualified: false, guardrails_ok: true, notes: "judge returned nothing" }
  );
}

export interface CaseResult extends EvalCaseInput {
  id: string;
}

export async function evaluateCase(spec: AgentSpec, persona: Persona): Promise<CaseResult> {
  const { transcript, outcome } = await runConversation(spec, persona);
  const agentQualified = outcome.fit?.qualified ?? null;

  const { expected_qualified, guardrails_ok, notes } = await judgeCase(spec, persona, transcript);

  // Correctness = the agent's own deterministic verdict matches what the criteria
  // imply for this lead's true facts (judged semantically, name-agnostic).
  const qualify_correct = agentQualified !== null && agentQualified === expected_qualified;
  const action_correct = expected_qualified
    ? Boolean(outcome.meeting_booked)
    : Boolean(outcome.callback_scheduled);
  const passed = qualify_correct && action_correct && guardrails_ok;

  return {
    id: persona.id,
    persona: persona.id,
    transcript,
    scores: {
      expected_qualified,
      agent_qualified: agentQualified,
      fit_score: outcome.fit?.score ?? null,
      qualify_correct,
      action_correct,
      meeting_booked: Boolean(outcome.meeting_booked),
      callback_scheduled: Boolean(outcome.callback_scheduled),
      guardrails_ok,
      guardrail_probe: persona.guardrailProbe ?? null,
    },
    passed,
    judge_notes: notes,
  };
}

export interface EvalSummary {
  runId: string;
  total: number;
  passed: number;
  qualifyRate: number; // % of cases where the agent's qualify verdict matched ground truth
  bookRate: number; // % of qualified-expected cases that got booked
  guardrailViolations: number;
  cases: { id: string; passed: boolean; notes: string }[];
}

export async function runEval(agentId: string): Promise<EvalSummary> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`agent ${agentId} not found`);
  const spec = await getCurrentSpec(agent);
  if (!spec) throw new Error(`no current spec for agent ${agentId}`);

  // Run personas sequentially (keeps token bursts modest and ordering stable).
  const results: CaseResult[] = [];
  for (const persona of PERSONAS) {
    results.push(await evaluateCase(spec, persona));
  }

  const passed = results.filter((r) => r.passed).length;
  const qualifyCorrect = results.filter((r) => r.scores.qualify_correct).length;
  const expectedQualified = results.filter((r) => r.scores.expected_qualified);
  const booked = expectedQualified.filter((r) => r.scores.meeting_booked).length;
  const guardrailViolations = results.filter((r) => r.scores.guardrails_ok === false).length;

  const summary: Omit<EvalSummary, "runId"> = {
    total: results.length,
    passed,
    qualifyRate: Math.round((qualifyCorrect / results.length) * 100),
    bookRate: expectedQualified.length
      ? Math.round((booked / expectedQualified.length) * 100)
      : 0,
    guardrailViolations,
    cases: results.map((r) => ({ id: r.id, passed: r.passed, notes: r.judge_notes })),
  };

  const runId = await insertRun(agentId, summary as unknown as Record<string, unknown>);
  await insertCases(
    runId,
    results.map(({ persona, transcript, scores, passed, judge_notes }) => ({
      persona,
      transcript,
      scores,
      passed,
      judge_notes,
    })),
  );

  return { runId, ...summary };
}
