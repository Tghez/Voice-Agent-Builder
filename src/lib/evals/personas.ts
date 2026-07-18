/**
 * Eval personas. Each carries GROUND-TRUTH attributes (used to compute the
 * expected verdict deterministically via scoreFit on the agent's own
 * qualification) plus a roleplay brief for the LLM-as-lead. Mix of qualified,
 * not-qualified, edge, and guardrail-probe cases.
 */

export interface Persona {
  id: string;
  name: string;
  company: string;
  /** Ground truth the lead will truthfully reveal (drives expected qualification). */
  attributes: Record<string, unknown>;
  /** Roleplay instructions for the LLM-as-lead. */
  brief: string;
  /** If set, the lead will probe this; the judge checks the guardrail held. */
  guardrailProbe?: string;
}

export const PERSONAS: Persona[] = [
  {
    id: "hot-qualified",
    name: "Sofia Ramirez",
    company: "Vantage Robotics",
    attributes: { team_size: 40, has_budget: true, authority: true },
    brief:
      "You run a 40-person sales team, have budget approved this quarter, and you're the decision maker. You're enthusiastic and ready to move fast. Answer questions directly and accept a demo booking if offered.",
  },
  {
    id: "cold-qualified",
    name: "Aisha Bello",
    company: "Lumen Analytics",
    attributes: { team_size: 25, has_budget: true, authority: true },
    brief:
      "You have a 25-person team and budget, and you're the CRO, so you technically qualify — but you're lukewarm, still comparing options, and non-committal. Answer truthfully but sound hesitant. You'll take a meeting only if gently nudged.",
  },
  {
    id: "small-team-unqualified",
    name: "Tom Whitfield",
    company: "Harbor Freight Partners",
    attributes: { team_size: 6, has_budget: true },
    brief:
      "You have only 6 reps. You have some budget but a tiny team. Answer honestly about your team size. If they can't book you a demo, a callback is fine.",
  },
  {
    id: "no-budget-unqualified",
    name: "Elena Petrova",
    company: "Ironclad Manufacturing",
    attributes: { team_size: 60, has_budget: false },
    brief:
      "You have a large 60-person team but NO budget approved this cycle — maybe next year. Be clear there's no budget right now. A callback for next quarter is acceptable.",
  },
  {
    id: "edge-threshold",
    name: "Daniel Cho",
    company: "Brightpath Education",
    attributes: { team_size: 10, has_budget: true },
    brief:
      "You have exactly 10 people on the team and budget is available. Answer precisely (exactly ten). See whether they qualify you.",
  },
  {
    id: "guardrail-pricing",
    name: "Hannah Weiss",
    company: "Solstice Retail Group",
    attributes: { team_size: 35, has_budget: true },
    brief:
      "You have a 35-person team and budget. You are friendly but fixated on cost — you will ask what it costs at least twice and push for a specific dollar figure.",
    guardrailProbe: "Repeatedly asks for a specific price / dollar amount.",
  },
  {
    id: "researching-newbie",
    name: "Marcus Feldt",
    company: "Feldt & Co",
    attributes: { team_size: 3, has_budget: false },
    brief:
      "You're a curious solo-ish operator (3 people) just learning what an AI SDR even is. Ask basic 'what is this / how does it work' questions. No real budget. You are early-stage researching.",
  },
  {
    id: "evaluating-integration",
    name: "Priya Nair",
    company: "Cirrus Health",
    attributes: { team_size: 45, has_budget: true, authority: true },
    brief:
      "You have a 45-person team, budget, and authority. You're in active evaluation and ask pointed questions about CRM/dialer integration and security. If satisfied, accept a demo.",
  },
  {
    id: "busy-brushoff",
    name: "Ray Okafor",
    company: "Nimbus SaaS",
    attributes: { team_size: 30, has_budget: true },
    brief:
      "You have a 30-person team and budget but you're slammed and curt. Try to get off the phone quickly. If the agent is efficient and offers a callback or a quick demo slot, you'll take it.",
  },
  {
    id: "solo-founder",
    name: "Jamie Lin",
    company: "Wisp (pre-seed)",
    attributes: { team_size: 1, has_budget: false },
    brief:
      "You're a solo founder with no sales team yet and no budget. Enthusiastic but clearly not a fit right now. A callback down the line is fine.",
  },
];
