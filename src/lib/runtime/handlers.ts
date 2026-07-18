import type { CalendarProvider } from "@/lib/providers/calendar";
import type { Qualification } from "@/lib/spec/schema";
import type { StructuredOutcome } from "@/lib/db/types";
import { scoreFit } from "@/lib/scoring/fit";

/**
 * Runtime tool handlers — the voice agent's tools, executed on our server. These
 * DO reach external systems (calendar, db). Kept behind a `ToolSession` seam so
 * the exact same logic runs from the Vapi webhook AND from text-mode evals,
 * without a live call. Each handler returns the string the agent speaks and
 * persists any structured outcome via the session.
 */

export interface ToolSession {
  qualification: Qualification;
  calendar: CalendarProvider;
  persistOutcome: (patch: Partial<StructuredOutcome>) => Promise<void>;
}

/** Track 1: deterministic scoring. NO LLM. */
export async function qualifyLead(
  args: Record<string, unknown>,
  s: ToolSession,
): Promise<string> {
  const fit = scoreFit(s.qualification, args);
  await s.persistOutcome({ fit, extracted: args });
  return fit.qualified
    ? `The lead is qualified (score ${fit.score}). ${fit.reason}`
    : `The lead is not qualified. ${fit.reason}`;
}

export async function checkAvailability(
  _args: Record<string, unknown>,
  s: ToolSession,
): Promise<string> {
  const slots = await s.calendar.getSlots();
  if (slots.length === 0) return "No open slots right now.";
  return (
    "Open times: " +
    slots.map((sl) => `${sl.label} [${sl.startISO}]`).join("; ") +
    ". Offer one and pass its bracketed time to book_meeting."
  );
}

export async function bookMeeting(
  args: { slot?: string; name?: string; email?: string },
  s: ToolSession,
): Promise<string> {
  if (!args.slot) return "I need a specific time slot to book. Call check_availability first.";
  const res = await s.calendar.book({ slot: args.slot, name: args.name, email: args.email });
  await s.persistOutcome({ meeting_booked: res.confirmed });
  return res.confirmed
    ? `Booked. ${res.detail} Confirmation ${res.bookingId}.`
    : "I couldn't book that time — try another slot.";
}

export async function scheduleCallback(
  args: { reason?: string; preferred_time?: string },
  s: ToolSession,
): Promise<string> {
  await s.persistOutcome({ callback_scheduled: true });
  return `Callback logged${args.preferred_time ? ` for ${args.preferred_time}` : ""}. We'll follow up then.`;
}

/** Route one tool call to its handler. */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  s: ToolSession,
): Promise<string> {
  switch (name) {
    case "qualify_lead":
      return qualifyLead(args, s);
    case "check_availability":
      return checkAvailability(args, s);
    case "book_meeting":
      return bookMeeting(args as { slot?: string; name?: string; email?: string }, s);
    case "schedule_callback":
      return scheduleCallback(args as { reason?: string; preferred_time?: string }, s);
    default:
      return `Unknown tool: ${name}`;
  }
}
