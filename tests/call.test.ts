import { describe, it, expect } from "vitest";
import { buildCallPayload } from "@/lib/call/initiateCall";
import type { Lead } from "@/lib/providers/crm";

const lead: Lead = {
  id: "lead_01",
  name: "Jordan Blake",
  company: "Northwind Logistics",
  title: "VP of Sales",
  email: "jordan@northwind.example",
  phone: "+15551230000", // always DEMO_PHONE from the CRM
  notes: "Team of ~40 SDRs, frustrated with current dialer, ready to move.",
  status: "new",
  created_at: "2026-07-01T00:00:00.000Z",
};

describe("buildCallPayload — per-call lead injection", () => {
  const p = buildCallPayload({
    assistantId: "asst_1",
    phoneNumberId: "pn_1",
    lead,
    callRowId: "row_1",
    agentId: "agent_1",
    leadId: "lead_01",
  });

  it("dials the demo phone, never the prospect", () => {
    expect(p.customer.number).toBe("+15551230000");
    expect(p.customer.name).toBe("Jordan Blake");
  });

  it("injects the rendered lead context into the {{leadContext}} variable", () => {
    expect(p.assistantOverrides?.variableValues?.leadContext).toContain("Team of ~40");
    expect(p.assistantOverrides?.variableValues?.leadContext).toContain("Jordan Blake");
  });

  it("carries correlation metadata for the webhooks", () => {
    expect(p.metadata).toEqual({ callRowId: "row_1", agentId: "agent_1", leadId: "lead_01" });
  });
});
