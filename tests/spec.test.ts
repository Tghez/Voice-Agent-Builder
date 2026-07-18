import { describe, it, expect } from "vitest";
import { AgentSpecSchema, emptySpec } from "@/lib/spec/schema";
import { applyToSpec } from "@/lib/spec/apply";

describe("AgentSpecSchema", () => {
  it("accepts the empty starter spec", () => {
    expect(() => AgentSpecSchema.parse(emptySpec())).not.toThrow();
  });

  it("fills criterion defaults (weight, gate) on parse", () => {
    const spec = emptySpec();
    spec.qualification.criteria = [
      // @ts-expect-error — omitting defaulted fields on purpose
      { field: "team_size", op: ">=", value: 10 },
    ];
    const parsed = AgentSpecSchema.parse(spec);
    expect(parsed.qualification.criteria[0].weight).toBe(1);
    expect(parsed.qualification.criteria[0].gate).toBe(false);
  });

  it("rejects an unknown voice", () => {
    const spec = emptySpec();
    // @ts-expect-error — invalid enum value
    spec.identity.voice = "robotic";
    expect(() => AgentSpecSchema.parse(spec)).toThrow();
  });
});

describe("applyToSpec — partial edits merge, never blind-overwrite", () => {
  it("configure_identity merges only provided fields", () => {
    const spec = emptySpec();
    const before = { ...spec.identity };
    const res = applyToSpec(spec, {
      name: "configure_identity",
      args: { persona: "Brisk and direct." },
    });
    expect(res.ok).toBe(true);
    expect(spec.identity.persona).toBe("Brisk and direct.");
    // untouched fields survive — this is the "edit, don't regenerate" guarantee
    expect(spec.identity.name).toBe(before.name);
    expect(spec.identity.voice).toBe(before.voice);
    expect(spec.identity.firstMessage).toBe(before.firstMessage);
  });

  it("configure_qualification sets criteria and merges scoring", () => {
    const spec = emptySpec();
    const res = applyToSpec(spec, {
      name: "configure_qualification",
      args: {
        criteria: [{ field: "team_size", op: ">=", value: 10, gate: true }],
        scoring: { passScore: 70 },
      },
    });
    expect(res.ok).toBe(true);
    expect(spec.qualification.criteria).toHaveLength(1);
    expect(spec.qualification.criteria[0].gate).toBe(true);
    expect(spec.qualification.scoring.passScore).toBe(70);
    expect(spec.qualification.scoring.mode).toBe("weighted"); // preserved
  });

  it("configure_actions replaces the tool set", () => {
    const spec = emptySpec();
    const res = applyToSpec(spec, {
      name: "configure_actions",
      args: { tools: ["qualify_lead", "book_meeting"] },
    });
    expect(res.ok).toBe(true);
    expect(spec.actions).toEqual(["qualify_lead", "book_meeting"]);
  });

  it("rejects invalid args and leaves the spec unchanged", () => {
    const spec = emptySpec();
    const res = applyToSpec(spec, {
      name: "configure_actions",
      args: { tools: ["send_carrier_pigeon"] },
    });
    expect(res.ok).toBe(false);
    expect(spec.actions).toEqual([]); // untouched
  });

  it("rejects an empty configure_identity call", () => {
    const spec = emptySpec();
    const res = applyToSpec(spec, { name: "configure_identity", args: {} });
    expect(res.ok).toBe(false);
  });
});
