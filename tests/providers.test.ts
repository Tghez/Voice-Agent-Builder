import { describe, it, expect, beforeAll } from "vitest";
import { MockCRM, renderLeadContext, demoPhone } from "@/lib/providers/crm";
import { MockCalendar } from "@/lib/providers/calendar";

describe("MockCRM", () => {
  beforeAll(() => {
    process.env.DEMO_PHONE = "+15551230000";
  });

  it("seeds a realistic set and forces every phone to DEMO_PHONE", async () => {
    const crm = new MockCRM();
    const leads = await crm.listLeads();
    expect(leads.length).toBeGreaterThanOrEqual(8);
    expect(leads.every((l) => l.phone === demoPhone())).toBe(true);
    expect(demoPhone()).toBe("+15551230000");
  });

  it("getLead resolves by id and returns null for unknown", async () => {
    const crm = new MockCRM();
    expect((await crm.getLead("lead_01"))?.name).toBe("Jordan Blake");
    expect(await crm.getLead("nope")).toBeNull();
  });

  it("renderLeadContext combines structured fields + unstructured notes", async () => {
    const crm = new MockCRM();
    const lead = (await crm.getLead("lead_06"))!;
    const ctx = renderLeadContext(lead);
    expect(ctx).toContain("Aisha Bello");
    expect(ctx).toContain("Notes:");
    expect(ctx).toContain(lead.notes);
  });
});

describe("MockCalendar", () => {
  it("offers three future slots and books one", async () => {
    const now = new Date("2026-07-18T09:00:00.000Z");
    const cal = new MockCalendar(() => now);
    const slots = await cal.getSlots();
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => new Date(s.startISO) > now)).toBe(true);

    const res = await cal.book({ slot: slots[0].startISO, name: "Jordan" });
    expect(res.confirmed).toBe(true);
    expect(res.detail).toContain("Jordan");
  });
});
