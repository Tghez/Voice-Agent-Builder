import { describe, it, expect } from "vitest";
import { AgentSpecSchema, emptySpec, type AgentSpec } from "@/lib/spec/schema";
import { buildVapiAssistant } from "@/lib/compiler/vapiMap";
import { syncSpecToVapi } from "@/lib/compiler/compile";
import type {
  VapiClient,
  VapiAssistantRef,
  VapiCallRef,
  CreateCallPayload,
} from "@/lib/compiler/vapiClient";

const opts = { baseUrl: "https://example.test" };

function sampleSpec(): AgentSpec {
  const s = emptySpec();
  s.goal = "Qualify the lead and book a demo.";
  s.qualification = {
    criteria: [
      { field: "team_size", op: ">=", value: 10, weight: 2, gate: true, label: "Team of at least 10" },
      { field: "budget", op: ">=", value: 5000, weight: 1, gate: false },
    ],
    scoring: { mode: "weighted", passScore: 60 },
  };
  s.actions = ["qualify_lead", "check_availability", "book_meeting", "schedule_callback"];
  s.guardrails = ["Never quote pricing.", "Keep it concise."];
  return AgentSpecSchema.parse(s);
}

class FakeVapi implements VapiClient {
  created: unknown[] = [];
  updated: { id: string; obj: unknown }[] = [];
  calls: CreateCallPayload[] = [];
  async createAssistant(obj: unknown): Promise<VapiAssistantRef> {
    this.created.push(obj);
    return { id: "asst_new" };
  }
  async updateAssistant(id: string, obj: unknown): Promise<VapiAssistantRef> {
    this.updated.push({ id, obj });
    return { id };
  }
  async createCall(payload: CreateCallPayload): Promise<VapiCallRef> {
    this.calls.push(payload);
    return { id: "call_1" };
  }
}

describe("buildVapiAssistant — deterministic mapping", () => {
  it("produces byte-identical JSON for the same spec", () => {
    const spec = sampleSpec();
    expect(JSON.stringify(buildVapiAssistant(spec, opts))).toBe(
      JSON.stringify(buildVapiAssistant(spec, opts)),
    );
  });

  it("emits a {{leadContext}} placeholder and bakes in NO lead data", () => {
    const sys = buildVapiAssistant(sampleSpec(), opts).model.messages[0].content;
    expect(sys).toContain("{{leadContext}}");
    // renderPrompt takes only the spec — there is no lead field to leak.
    expect(sys).not.toMatch(/\+\d{7,}/); // no phone numbers
  });

  it("points tool server.url at /api/vapi/tools and derives qualify_lead params from criteria", () => {
    const obj = buildVapiAssistant(sampleSpec(), opts);
    expect(obj.model.tools).toHaveLength(4);
    const qualify = obj.model.tools.find((t) => t.function.name === "qualify_lead")!;
    expect(qualify.server.url).toBe("https://example.test/api/vapi/tools");
    expect(Object.keys(qualify.function.parameters.properties!)).toEqual([
      "team_size",
      "budget",
    ]);
  });

  it("derives analysisPlan.structuredDataPlan.schema from qualification", () => {
    const schema = buildVapiAssistant(sampleSpec(), opts).analysisPlan
      .structuredDataPlan.schema;
    expect(Object.keys(schema.properties!)).toEqual([
      "qualified",
      "team_size",
      "budget",
      "meeting_booked",
      "callback_scheduled",
    ]);
  });

  it("sets the in-call model + temperature and Cartesia/Deepgram providers", () => {
    const obj = buildVapiAssistant(sampleSpec(), opts);
    expect(obj.model.provider).toBe("anthropic");
    expect(obj.model.temperature).toBe(0.4);
    expect(obj.voice.provider).toBe("cartesia");
    expect(obj.transcriber).toEqual({ provider: "deepgram", model: "nova-2", language: "en" });
    expect(obj.server.url).toBe("https://example.test/api/vapi/events");
  });
});

describe("syncSpecToVapi — airlock + POST/PATCH", () => {
  it("POSTs a new assistant when there is no vapiAssistantId", async () => {
    const fake = new FakeVapi();
    const r = await syncSpecToVapi(sampleSpec(), fake, opts);
    expect(fake.created).toHaveLength(1);
    expect(fake.updated).toHaveLength(0);
    expect(r.assistantId).toBe("asst_new");
    expect(r.spec.vapiAssistantId).toBe("asst_new");
  });

  it("PATCHes when a vapiAssistantId is already present", async () => {
    const fake = new FakeVapi();
    const spec = { ...sampleSpec(), vapiAssistantId: "asst_existing" };
    const r = await syncSpecToVapi(spec, fake, opts);
    expect(fake.updated).toHaveLength(1);
    expect(fake.created).toHaveLength(0);
    expect(r.assistantId).toBe("asst_existing");
  });

  it("rejects a malformed spec BEFORE calling Vapi (the airlock)", async () => {
    const fake = new FakeVapi();
    const bad = {
      ...sampleSpec(),
      identity: { ...sampleSpec().identity, voice: "robotic" },
    } as unknown as AgentSpec;
    await expect(syncSpecToVapi(bad, fake, opts)).rejects.toThrow();
    expect(fake.created).toHaveLength(0);
    expect(fake.updated).toHaveLength(0);
  });
});
