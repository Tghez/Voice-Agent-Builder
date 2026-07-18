import { describe, it, expect } from "vitest";
import { dispatchTool, type ToolSession } from "@/lib/runtime/handlers";
import { MockCalendar } from "@/lib/providers/calendar";
import type { Qualification } from "@/lib/spec/schema";
import type { StructuredOutcome } from "@/lib/db/types";

function makeSession(qualification: Qualification): {
  session: ToolSession;
  outcome: StructuredOutcome;
} {
  const outcome: StructuredOutcome = {};
  const session: ToolSession = {
    qualification,
    calendar: new MockCalendar(() => new Date("2026-07-18T09:00:00.000Z")),
    persistOutcome: async (patch) => {
      Object.assign(outcome, patch);
    },
  };
  return { session, outcome };
}

const QUAL: Qualification = {
  criteria: [
    { field: "team_size", op: ">=", value: 10, weight: 2, gate: true },
    { field: "has_budget", op: "==", value: true, weight: 1, gate: false },
  ],
  scoring: { mode: "weighted", passScore: 60 },
};

describe("runtime tool handlers", () => {
  it("qualify_lead scores deterministically and persists fit + extracted", async () => {
    const { session, outcome } = makeSession(QUAL);
    const msg = await dispatchTool("qualify_lead", { team_size: 40, has_budget: true }, session);
    expect(msg).toContain("qualified");
    expect(outcome.fit?.qualified).toBe(true);
    expect(outcome.extracted).toEqual({ team_size: 40, has_budget: true });
  });

  it("qualify_lead marks a gate failure as not qualified", async () => {
    const { session, outcome } = makeSession(QUAL);
    const msg = await dispatchTool("qualify_lead", { team_size: 8, has_budget: true }, session);
    expect(msg).toContain("not qualified");
    expect(outcome.fit?.passed_gates).toBe(false);
  });

  it("check_availability lists slots the agent can offer", async () => {
    const { session } = makeSession(QUAL);
    const msg = await dispatchTool("check_availability", {}, session);
    expect(msg).toContain("Open times:");
    expect(msg).toContain("2026-07-19");
  });

  it("book_meeting books and persists meeting_booked", async () => {
    const { session, outcome } = makeSession(QUAL);
    const msg = await dispatchTool(
      "book_meeting",
      { slot: "2026-07-19T15:00:00.000Z", name: "Jordan" },
      session,
    );
    expect(msg).toContain("Booked");
    expect(outcome.meeting_booked).toBe(true);
  });

  it("book_meeting without a slot asks for one and does not book", async () => {
    const { session, outcome } = makeSession(QUAL);
    const msg = await dispatchTool("book_meeting", {}, session);
    expect(msg).toContain("check_availability");
    expect(outcome.meeting_booked).toBeUndefined();
  });

  it("schedule_callback persists callback_scheduled", async () => {
    const { session, outcome } = makeSession(QUAL);
    const msg = await dispatchTool("schedule_callback", { preferred_time: "tomorrow 2pm" }, session);
    expect(msg).toContain("Callback logged");
    expect(outcome.callback_scheduled).toBe(true);
  });
});
