import { env } from "@/lib/env";

/**
 * Calendar layer behind a clean interface. README claim: "Google Calendar is a
 * provider swap." Real impl is Cal.com (which syncs to Google Calendar itself,
 * configured on the Cal.com side — see CalcomCalendar below); MockCalendar is
 * the fallback used until Cal.com is provisioned (and in text-mode evals).
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

const CALCOM_API_BASE = "https://api.cal.com/v2";
/** Cal.com API versions this integration targets (per-endpoint, per Cal.com's v2 docs). */
const SLOTS_API_VERSION = "2024-09-04";
const BOOKINGS_API_VERSION = "2024-08-13";
/** How many days' worth of slots (one per day) to offer on a call. */
const MAX_DAYS_OFFERED = 3;

interface CalcomSlotsResponse {
  data?: Record<string, Array<{ start: string }>>;
}

interface CalcomBookingResponse {
  data?: { uid: string };
}

/**
 * Real calendar provider, backed by Cal.com's v2 API. Google Calendar sync is
 * NOT done here — it's a one-time setup on the Cal.com side (connect the Google
 * Calendar app as a destination calendar for the event type). This class just
 * reads open slots and creates bookings against a Cal.com event type; whatever
 * calendar that event type is wired to is where the meeting lands.
 *
 * Wired in when both CALCOM_API_KEY and CALCOM_EVENT_TYPE_ID are set (see
 * getCalendar() below); errors are swallowed into graceful "no slots" /
 * "couldn't book" results rather than thrown, so a flaky Cal.com call never
 * surfaces as a raw error the agent has to speak on a live call.
 */
export class CalcomCalendar implements CalendarProvider {
  constructor(
    private apiKey: string,
    private eventTypeId: string,
    private timeZone: string = "UTC",
  ) {}

  private async request<T>(
    path: string,
    apiVersion: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${CALCOM_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "cal-api-version": apiVersion,
        ...init?.headers,
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Cal.com ${path} → ${res.status}: ${JSON.stringify(body)}`);
    }
    return body as T;
  }

  async getSlots(): Promise<Slot[]> {
    const start = new Date();
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const params = new URLSearchParams({
      eventTypeId: this.eventTypeId,
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: this.timeZone,
    });
    try {
      const body = await this.request<CalcomSlotsResponse>(
        `/slots?${params.toString()}`,
        SLOTS_API_VERSION,
      );
      // Cal.com returns every open half-hour slot, grouped by day — a single
      // day alone can be a dozen slots. Reading all of those aloud is what
      // caused Maya to summarize them as a vague range ("10:30 AM to 1:30 PM")
      // instead of offering a specific bookable time, which the lead then
      // couldn't confirm precisely. Offer at most one slot per day (like
      // MockCalendar's shape) so what the agent says is always one exact,
      // clearly distinct, speakable option.
      const days = Object.entries(body.data ?? {}).sort(([a], [b]) => a.localeCompare(b));
      const slots: Slot[] = [];
      for (const [, daySlots] of days) {
        const first = daySlots[0];
        if (!first) continue;
        const d = new Date(first.start);
        slots.push({ id: first.start, startISO: d.toISOString(), label: fmtLabel(d) });
        if (slots.length >= MAX_DAYS_OFFERED) break;
      }
      return slots;
    } catch (e) {
      console.error("CalcomCalendar.getSlots failed:", e);
      return [];
    }
  }

  async book(args: BookArgs): Promise<BookResult> {
    const start = new Date(args.slot);
    try {
      const body = await this.request<CalcomBookingResponse>(
        "/bookings",
        BOOKINGS_API_VERSION,
        {
          method: "POST",
          body: JSON.stringify({
            start: start.toISOString(),
            eventTypeId: Number(this.eventTypeId),
            attendee: {
              name: args.name || "Prospect",
              email: args.email || "unknown@example.com",
              timeZone: this.timeZone,
            },
          }),
        },
      );
      if (!body.data?.uid) throw new Error("Cal.com booking response missing uid");
      const slot: Slot = { id: body.data.uid, startISO: start.toISOString(), label: fmtLabel(start) };
      return {
        confirmed: true,
        bookingId: body.data.uid,
        slot,
        detail: `Booked ${slot.label}${args.name ? ` with ${args.name}` : ""}.`,
      };
    } catch (e) {
      console.error("CalcomCalendar.book failed:", e);
      const slot: Slot = { id: `failed_${start.getTime()}`, startISO: start.toISOString(), label: fmtLabel(start) };
      return { confirmed: false, bookingId: "", slot, detail: "Cal.com booking failed." };
    }
  }
}

/**
 * Provider factory. Cal.com (real) when both CALCOM_API_KEY and
 * CALCOM_EVENT_TYPE_ID are set, mock otherwise (and always mock in text-mode
 * evals, which construct their own ToolSession directly rather than via this
 * factory).
 */
export function getCalendar(): CalendarProvider {
  const apiKey = env.calcomKey();
  const eventTypeId = env.calcomEventTypeId();
  if (apiKey && eventTypeId) return new CalcomCalendar(apiKey, eventTypeId);
  return new MockCalendar();
}
