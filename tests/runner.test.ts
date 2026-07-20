import { describe, it, expect, vi } from "vitest";
import { scoreFit } from "@/lib/scoring/fit";
import { emptySpec, type AgentSpec, type Criterion } from "@/lib/spec/schema";
import type { Persona } from "@/lib/evals/types";

/**
 * The one test that would have caught the original bug: ground-truth
 * qualification must come from `scoreFit` on the persona's true attributes —
 * NOT from an LLM guess. We stub the LLM to a no-op (agent never calls a tool),
 * so `expected_qualified` is exercised in isolation.
 */
vi.mock("@/lib/llm/client", () => ({
  getAnthropic: () => ({
    messages: {
      create: async () => ({ content: [{ type: "text", text: "ok" }] }),
      parse: async () => ({ parsed_output: { guardrails_ok: true, notes: "fine" } }),
    },
  }),
}));

const { evaluateCase } = await import("@/lib/evals/runner");

function crit(p: Partial<Criterion> & Pick<Criterion, "field" | "op" | "value">): Criterion {
  return { weight: 1, gate: false, ...p };
}
function specWith(criteria: Criterion[]): AgentSpec {
  return {
    ...emptySpec(),
    identity: { name: "Rep", persona: "friendly", voice: "friendly-female", firstMessage: "Hi!" },
    goal: "Sell",
    qualification: { criteria, scoring: { mode: "weighted", passScore: 60 } },
    actions: ["qualify_lead"],
    guardrails: [],
  };
}

const spec = specWith([crit({ field: "team_size", op: ">=", value: 10, gate: true })]);

function persona(attributes: Record<string, unknown>): Persona {
  return { id: "case", name: "Lead", company: "Co", attributes, brief: "answer briefly" };
}

describe("evaluateCase — deterministic ground truth", () => {
  it("expected_qualified equals scoreFit(...).qualified for a qualified lead", async () => {
    const p = persona({ team_size: 20 });
    const r = await evaluateCase(spec, p);
    expect(r.scores.expected_qualified).toBe(scoreFit(spec.qualification, p.attributes).qualified);
    expect(r.scores.expected_qualified).toBe(true);
  });

  it("expected_qualified equals scoreFit(...).qualified for an unqualified lead", async () => {
    const p = persona({ team_size: 5 });
    const r = await evaluateCase(spec, p);
    expect(r.scores.expected_qualified).toBe(scoreFit(spec.qualification, p.attributes).qualified);
    expect(r.scores.expected_qualified).toBe(false);
  });

  it("carries the full persona through and leaves fit null when the agent never qualifies", async () => {
    const p = persona({ team_size: 20 });
    const r = await evaluateCase(spec, p);
    expect(r.persona).toEqual(p);
    expect(r.scores.agent_qualified).toBeNull();
    expect(r.scores.fit).toBeNull();
    expect(r.scores.qualify_correct).toBe(false); // agent gave no verdict
  });
});
