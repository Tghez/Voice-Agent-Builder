import { describe, it, expect } from "vitest";
import { diffSpecs } from "@/lib/builder/diff";
import { emptySpec } from "@/lib/spec/schema";

describe("diffSpecs", () => {
  it("reports creation when there is no previous spec", () => {
    const d = diffSpecs(null, emptySpec());
    expect(d.summary.join(" ")).toContain("Created");
  });

  it("detects a persona-only change and leaves other sections out", () => {
    const before = emptySpec();
    const after = { ...before, identity: { ...before.identity, persona: "Brisk and direct." } };
    const d = diffSpecs(before, after);
    expect(d.changes.map((c) => c.path)).toEqual(["identity.persona"]);
    expect(d.summary.join(" ")).toContain("persona");
  });

  it("summarizes qualification + actions changes", () => {
    const before = emptySpec();
    const after = {
      ...before,
      actions: ["qualify_lead", "book_meeting"] as const,
      qualification: {
        criteria: [{ field: "team_size", op: ">=" as const, value: 10, weight: 1, gate: true }],
        scoring: { mode: "weighted" as const, passScore: 60 },
      },
    };
    const d = diffSpecs(before, after);
    const paths = d.changes.map((c) => c.path);
    expect(paths).toContain("qualification");
    expect(paths).toContain("actions");
  });

  it("reports no changes for identical specs", () => {
    const s = emptySpec();
    expect(diffSpecs(s, structuredClone(s)).summary).toEqual(["No changes."]);
  });
});
