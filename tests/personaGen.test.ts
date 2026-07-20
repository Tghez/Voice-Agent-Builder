import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCasePlan } from "@/lib/evals/casePlan";
import { emptySpec, type AgentSpec, type Criterion } from "@/lib/spec/schema";

// Mock the shared Anthropic client — no network. The mutable `mockPersonas`
// stands in for the structured-output response of the one generation call.
let mockPersonas: unknown[] = [];
vi.mock("@/lib/llm/client", () => ({
  getAnthropic: () => ({
    messages: { parse: async () => ({ parsed_output: { personas: mockPersonas } }) },
  }),
}));

// Import AFTER the mock is registered.
const { fleshOutPersonas, specHashForPersonaSet } = await import("@/lib/evals/personaGen");

function crit(p: Partial<Criterion> & Pick<Criterion, "field" | "op" | "value">): Criterion {
  return { weight: 1, gate: false, ...p };
}
function specWith(criteria: Criterion[], guardrails: string[] = []): AgentSpec {
  return {
    ...emptySpec(),
    goal: "Sell the thing",
    qualification: { criteria, scoring: { mode: "weighted", passScore: 60 } },
    guardrails,
  };
}

const spec = specWith([
  crit({ field: "team_size", op: ">=", value: 10, gate: true }),
  crit({ field: "owns_budget", op: "==", value: true, weight: 2 }),
]);

beforeEach(() => {
  mockPersonas = [];
});

describe("fleshOutPersonas", () => {
  it("locked-slot attributes win over the LLM response", async () => {
    const plan = buildCasePlan(spec);
    const anchor = plan.find((s) => s.kind === "qualified-anchor")!;
    mockPersonas = [
      {
        slotId: anchor.id,
        name: "Dana",
        company: "Acme",
        brief: "great fit",
        attributesJson: JSON.stringify({ team_size: 999, owns_budget: false }),
      },
    ];
    const personas = await fleshOutPersonas(spec, plan);
    const got = personas.find((p) => p.id === anchor.id)!;
    // Prose from the LLM…
    expect(got.name).toBe("Dana");
    // …but attributes are the locked plan's, untouched.
    expect(got.attributes).toEqual(anchor.attributes);
  });

  it("drops invented field names on freeform slots, keeps real ones", async () => {
    const plan = buildCasePlan(spec);
    const freeform = plan.find((s) => s.kind === "freeform")!;
    mockPersonas = [
      {
        slotId: freeform.id,
        name: "Lee",
        company: "Beta",
        brief: "curious",
        attributesJson: JSON.stringify({ team_size: 42, made_up_field: 7 }),
      },
    ];
    const personas = await fleshOutPersonas(spec, plan);
    const got = personas.find((p) => p.id === freeform.id)!;
    expect(got.attributes.team_size).toBe(42); // real field applied
    expect(got.attributes).not.toHaveProperty("made_up_field"); // invented dropped
    expect(got.attributes).toHaveProperty("owns_budget"); // completeness preserved
  });

  it("a short/empty response still yields exactly 10 personas via fallback", async () => {
    mockPersonas = [];
    const plan = buildCasePlan(spec);
    const personas = await fleshOutPersonas(spec, plan);
    expect(personas).toHaveLength(10);
    for (const p of personas) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.brief.length).toBeGreaterThan(0);
    }
  });
});

describe("specHashForPersonaSet", () => {
  it("is stable under key reordering, changes with content", () => {
    const a = specWith([crit({ field: "n", op: ">=", value: 10 })], ["r1"]);
    const b: AgentSpec = {
      ...a,
      qualification: { scoring: { passScore: 60, mode: "weighted" }, criteria: a.qualification.criteria },
    };
    expect(specHashForPersonaSet(a)).toBe(specHashForPersonaSet(b));

    const c = specWith([crit({ field: "n", op: ">=", value: 20 })], ["r1"]);
    expect(specHashForPersonaSet(a)).not.toBe(specHashForPersonaSet(c));
  });
});
