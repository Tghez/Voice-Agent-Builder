/**
 * Calendar layer behind a clean interface. README claim: "Google Calendar is a
 * provider swap." Real impl is Cal.com; MockCalendar is the fallback used until
 * Cal.com is provisioned (and in text-mode evals).
 */

export interface Slot {
  /** Opaque id the model passes back to book_meeting. */
  id: string;
  /** ISO 8601 start time. */
  startISO: string;
  /** Human label for the agent to offer, e.g. "Tue Jul 21, 10:00 AM". */
  label: string;
}

export interface BookResult {
  confirmed: boolean;
  bookingId: string;
  slot: Slot;
  detail: string;
}

export interface BookArgs {
  slot: string; // ISO datetime the agent chose
  name?: string;
  email?: string;
}

export interface CalendarProvider {
  getSlots(): Promise<Slot[]>;
  book(args: BookArgs): Promise<BookResult>;
}

function fmtLabel(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/**
 * Deterministic-ish mock: offers the next three days at 15:00 UTC. `book` always
 * confirms and echoes the slot. (Supabase persistence is wired in when the db
 * layer lands; for now it returns a confirmation object.)
 */
export class MockCalendar implements CalendarProvider {
  constructor(private now: () => Date = () => new Date()) {}

  async getSlots(): Promise<Slot[]> {
    const base = this.now();
    const slots: Slot[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + i);
      d.setUTCHours(15, 0, 0, 0);
      slots.push({ id: `slot_${i}`, startISO: d.toISOString(), label: fmtLabel(d) });
    }
    return slots;
  }

  async book(args: BookArgs): Promise<BookResult> {
    const start = new Date(args.slot);
    const slot: Slot = {
      id: `booked_${start.getTime()}`,
      startISO: start.toISOString(),
      label: fmtLabel(start),
    };
    return {
      confirmed: true,
      bookingId: `mock_${start.getTime()}`,
      slot,
      detail: `Booked ${slot.label}${args.name ? ` with ${args.name}` : ""}.`,
    };
  }
}
