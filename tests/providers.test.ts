import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { MockCRM, renderLeadContext, demoPhone } from "@/lib/providers/crm";
import { MockCalendar, CalcomCalendar } from "@/lib/providers/calendar";

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

describe("CalcomCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers only the first slot of each day, capped at 3 days, so options stay distinct", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          // Day 1 alone has 7 half-hour slots — only the first should be offered.
          "2026-07-20": [
            { start: "2026-07-20T10:30:00.000Z" },
            { start: "2026-07-20T11:00:00.000Z" },
            { start: "2026-07-20T11:30:00.000Z" },
          ],
          "2026-07-21": [{ start: "2026-07-21T06:00:00.000Z" }],
          "2026-07-22": [{ start: "2026-07-22T06:00:00.000Z" }],
          "2026-07-23": [{ start: "2026-07-23T06:00:00.000Z" }], // beyond the 3-day cap
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cal = new CalcomCalendar("test_key", "42");
    const slots = await cal.getSlots();

    expect(slots.map((s) => s.startISO)).toEqual([
      "2026-07-20T10:30:00.000Z",
      "2026-07-21T06:00:00.000Z",
      "2026-07-22T06:00:00.000Z",
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("https://api.cal.com/v2/slots?");
    expect(url).toContain("eventTypeId=42");
    expect(init.headers.Authorization).toBe("Bearer test_key");
    expect(init.headers["cal-api-version"]).toBe("2024-09-04");
  });

  it("books a slot and returns Cal.com's booking uid", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { uid: "booking_abc" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cal = new CalcomCalendar("test_key", "42");
    const res = await cal.book({ slot: "2026-07-21T15:00:00.000Z", name: "Jordan", email: "j@x.com" });

    expect(res.confirmed).toBe(true);
    expect(res.bookingId).toBe("booking_abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.cal.com/v2/bookings");
    expect(init.method).toBe("POST");
    const sentBody = JSON.parse(init.body);
    expect(sentBody.eventTypeId).toBe(42);
    expect(sentBody.attendee).toEqual({ name: "Jordan", email: "j@x.com", timeZone: "UTC" });
  });

  it("degrades gracefully instead of throwing when Cal.com errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "bad request" }) }),
    );

    const cal = new CalcomCalendar("test_key", "42");
    expect(await cal.getSlots()).toEqual([]);

    const res = await cal.book({ slot: "2026-07-21T15:00:00.000Z" });
    expect(res.confirmed).toBe(false);
  });
});
