/**
 * Shared transcript parsing. The `calls.transcript` jsonb column stores
 * whatever Vapi's end-of-call-report handed us (see api/vapi/events/route.ts) —
 * usually an array of turns, occasionally a plain string. Both the Track-2
 * intent scorer (needs flat text) and the dashboard call-detail view (needs
 * per-turn structure) parse the same shape, so it lives here once.
 */

interface RawTranscriptTurn {
  role?: string;
  message?: string;
  content?: string;
}

export interface TranscriptTurn {
  role: string;
  text: string;
}

/** A plain-string transcript prefixes each line with its speaker, e.g. "AI: hi\nUser: yeah". */
const SPEAKER_LINE = /^([^:\n]{1,20}):\s*(.*)$/;

export function normalizeTranscript(raw: unknown): TranscriptTurn[] {
  if (typeof raw === "string") {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(SPEAKER_LINE);
        return m ? { role: m[1], text: m[2] } : { role: "", text: line };
      });
  }
  if (Array.isArray(raw)) {
    return (raw as RawTranscriptTurn[]).map((t) => ({
      role: t.role ?? "",
      text: t.message ?? t.content ?? "",
    }));
  }
  return [];
}

export function transcriptToText(raw: unknown): string {
  return normalizeTranscript(raw)
    .map((t) => `${t.role}: ${t.text}`.trim())
    .join("\n");
}

/** Vapi/plain-string transcripts label the agent side "assistant", "bot", "agent", or "AI". */
export function isAgentRole(role: string): boolean {
  return /^(assistant|bot|agent|ai)$/i.test(role.trim());
}
