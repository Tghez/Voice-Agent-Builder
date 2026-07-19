import type { AgentSpec, Criterion } from "@/lib/spec/schema";

/**
 * renderPrompt — the compiler's core act: structured spec → the natural-language
 * system prompt the voice LLM runs on. DETERMINISTIC and LEAD-AGNOSTIC: it takes
 * only the spec and emits a `{{leadContext}}` placeholder that Vapi fills per-call
 * (via assistantOverrides.variableValues). One assistant is compiled per agent
 * and reused across every lead — baking lead data in here would force a
 * recompile + PATCH per lead.
 *
 * Context layering is deliberate (mitigates "lost in the middle": models recall
 * the start and end of a long prompt reliably but drop facts from the middle):
 *   TOP     — identity + critical guardrails + qualification/booking rules
 *   MIDDLE  — injected lead context ({{leadContext}})
 *   END     — the immediate goal, then the critical guardrails REPEATED
 * The most critical guardrails sit at both edges, never buried mid-prompt.
 */

const OP_EN: Record<Criterion["op"], string> = {
  ">=": "at least",
  "<=": "at most",
  ">": "greater than",
  "<": "less than",
  "==": "is",
  "!=": "is not",
  in: "is one of",
  not_in: "is not one of",
  contains: "contains",
  exists: "is provided",
};

function criterionToEnglish(c: Criterion): string {
  if (c.label) return c.label;
  const val = Array.isArray(c.value) ? c.value.join(", ") : String(c.value);
  const gate = c.gate ? " (required)" : "";
  if (c.op === "exists") return `${c.field} is provided${gate}`;
  return `${c.field} ${OP_EN[c.op]} ${val}${gate}`;
}

function guardrailsBlock(spec: AgentSpec): string {
  if (spec.guardrails.length === 0) return "None specified.";
  return spec.guardrails.map((g) => `- ${g}`).join("\n");
}

export function renderPrompt(spec: AgentSpec): string {
  const rules = guardrailsBlock(spec);
  const has = (t: string) => spec.actions.includes(t as never);

  const sections: string[] = [];

  // ── TOP: identity + critical rules + qualification/booking instructions ──
  sections.push(
    `# Identity\nYou are ${spec.identity.name}. ${spec.identity.persona}`.trim(),
  );

  sections.push(`# Rules (must follow)\n${rules}`);

  if (spec.qualification.criteria.length > 0 || has("qualify_lead")) {
    const crit =
      spec.qualification.criteria.length > 0
        ? spec.qualification.criteria.map((c) => `- ${criterionToEnglish(c)}`).join("\n")
        : "- (no criteria configured yet)";
    sections.push(
      `# Qualification\nQualify the lead against these criteria:\n${crit}\n` +
        `Call qualify_lead as soon as you have the answers — do not wait until the end of the call.`,
    );
  }

  if (has("book_meeting") || has("schedule_callback")) {
    const booking: string[] = [];
    if (has("check_availability") && has("book_meeting")) {
      booking.push(
        "If the lead qualifies: call check_availability, offer a slot, then call book_meeting to confirm.",
      );
    } else if (has("book_meeting")) {
      booking.push("If the lead qualifies: call book_meeting to confirm a time.");
    }
    if (has("schedule_callback")) {
      booking.push(
        "If the lead does not qualify (or now is a bad time): call schedule_callback instead of booking.",
      );
    }
    sections.push(`# Booking\n${booking.join("\n")}`);
  }

  // ── MIDDLE: per-call lead context, injected by Vapi at call time ──
  sections.push(
    `# Lead you are calling\n{{leadContext}}\n\n` +
      `Use the notes above to personalize the conversation; never read them aloud verbatim.`,
  );

  // ── END: the immediate goal, then critical rules REPEATED (edge recall) ──
  sections.push(`# Your goal on this call\n${spec.goal || "(goal not set)"}`);

  sections.push(
    `# Rules (reminder — these override everything above)\n${rules}`,
  );

  return sections.join("\n\n");
}
