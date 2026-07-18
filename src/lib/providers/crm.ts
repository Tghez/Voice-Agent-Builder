import { SEED_LEADS } from "./seedLeads";

/**
 * CRM/context layer behind a clean interface. README claim: "HubSpot is a
 * provider swap — implement CRMProvider." Rows carry BOTH structured
 * firmographics and an unstructured `notes` field; the notes are what Track-2
 * intent scoring and the per-call lead context draw on.
 */

export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified";

export interface Lead {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  notes: string;
  status: LeadStatus;
  created_at: string;
}

export interface CRMProvider {
  listLeads(): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
}

/** Every lead's phone routes here — we never dial a real prospect. */
export function demoPhone(): string {
  return process.env.DEMO_PHONE ?? "+10000000000";
}

/**
 * Render the per-call lead context block that fills the compiled prompt's
 * {{leadContext}} slot (via Vapi assistantOverrides.variableValues at call time).
 * Combines structured fields + the unstructured `notes`.
 */
export function renderLeadContext(lead: Lead): string {
  return [
    `Name: ${lead.name}`,
    `Title: ${lead.title}`,
    `Company: ${lead.company}`,
    `Email: ${lead.email}`,
    `CRM status: ${lead.status}`,
    `Notes: ${lead.notes}`,
  ].join("\n");
}

/** In-memory CRM seeded from the shared dataset; phones forced to DEMO_PHONE. */
export class MockCRM implements CRMProvider {
  private leads: Lead[];
  constructor() {
    const phone = demoPhone();
    const created = "2026-07-01T00:00:00.000Z";
    this.leads = SEED_LEADS.map((l) => ({ ...l, phone, created_at: created }));
  }
  async listLeads(): Promise<Lead[]> {
    return this.leads;
  }
  async getLead(id: string): Promise<Lead | null> {
    return this.leads.find((l) => l.id === id) ?? null;
  }
}
