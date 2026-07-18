import type { Lead } from "./crm";

/**
 * Seed leads — a realistic-looking CRM (varied names/companies/titles/notes,
 * mixed structured firmographics + unstructured `notes`). The same dataset seeds
 * both the mock CRM and the Supabase `leads` table so they never drift.
 *
 * NOTE: `phone` here is cosmetic. Every call actually routes to DEMO_PHONE — the
 * mock CRM and the SQL seed both force it — so we never dial a real prospect.
 */
export const SEED_LEADS: Omit<Lead, "phone" | "created_at">[] = [
  {
    id: "lead_01",
    name: "Jordan Blake",
    company: "Northwind Logistics",
    title: "VP of Sales",
    email: "jordan.blake@northwind.example",
    status: "new",
    notes:
      "Inbound from webinar. Team of ~40 SDRs, clearly frustrated with current dialer. Asked 'how fast can we get live' — sounds ready to move.",
  },
  {
    id: "lead_02",
    name: "Priya Nair",
    company: "Cirrus Health",
    title: "Head of Revenue Ops",
    email: "priya.nair@cirrushealth.example",
    status: "new",
    notes:
      "Downloaded the ROI whitepaper. Mentioned procurement is slow and legal reviews every vendor. Evaluating 3 tools. Cares about CRM integration.",
  },
  {
    id: "lead_03",
    name: "Marcus Feldt",
    company: "Feldt & Co (solo)",
    title: "Owner",
    email: "marcus@feldtco.example",
    status: "new",
    notes:
      "One-person consultancy. Curious but 'just researching what an AI SDR even is'. No budget line yet.",
  },
  {
    id: "lead_04",
    name: "Sofia Ramirez",
    company: "Vantage Robotics",
    title: "Director of Growth",
    email: "sofia.ramirez@vantagerobotics.example",
    status: "contacted",
    notes:
      "Warm — referred by an existing customer. ~25 person GTM team, $30k tooling budget approved this quarter. Wants a demo before Friday.",
  },
  {
    id: "lead_05",
    name: "Tom Whitfield",
    company: "Harbor Freight Partners",
    title: "Sales Manager",
    email: "tom.whitfield@harborfp.example",
    status: "new",
    notes:
      "Kicked the tires last year, went quiet. Team of 8. Skeptical of AI — 'my reps won't trust a robot'. Price sensitive.",
  },
  {
    id: "lead_06",
    name: "Aisha Bello",
    company: "Lumen Analytics",
    title: "Chief Revenue Officer",
    email: "aisha.bello@lumenanalytics.example",
    status: "new",
    notes:
      "CRO at a 200-person Series C. Explicit mandate to automate top-of-funnel. Budget is not a concern; wants proof it books qualified meetings.",
  },
  {
    id: "lead_07",
    name: "Daniel Cho",
    company: "Brightpath Education",
    title: "Marketing Lead",
    email: "daniel.cho@brightpath.example",
    status: "new",
    notes:
      "Non-technical. Interested but really wants to understand how the AI builder works. Team of 15, moderate budget. Asked about pricing twice.",
  },
  {
    id: "lead_08",
    name: "Elena Petrova",
    company: "Ironclad Manufacturing",
    title: "VP Commercial",
    email: "elena.petrova@ironclad.example",
    status: "contacted",
    notes:
      "Long sales cycles in their industry. Team of 60. Asked specifically 'how does this integrate with our CRM and dialer' — evaluating, not researching.",
  },
  {
    id: "lead_09",
    name: "Ray Okafor",
    company: "Nimbus SaaS",
    title: "Founder & CEO",
    email: "ray@nimbussaas.example",
    status: "new",
    notes:
      "Early-stage founder, 4 people total. High energy, wants to buy today, but no real SDR team yet. Enthusiasm > fit.",
  },
  {
    id: "lead_10",
    name: "Hannah Weiss",
    company: "Solstice Retail Group",
    title: "Director of Sales Enablement",
    email: "hannah.weiss@solstice.example",
    status: "new",
    notes:
      "35-person team across 3 regions. Budget approved. Main worry is guardrails — 'it can never quote a price or make promises we can't keep'.",
  },
];
