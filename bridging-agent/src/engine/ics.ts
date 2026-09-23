/**
 * Standard iCalendar (RFC 5545) output. One-way and setup-free: Outlook, Google, Apple and most
 * to-do apps accept it (FR5.1). Each commitment is one VEVENT with a stable UID and a SEQUENCE
 * that increases on every change, so calendars update rather than duplicate.
 */

export type IcsEvent = {
  uid: string;
  sequence: number;
  start: Date;
  durationMinutes: number;
  summary: string;
  description: string;
  location: string;
  url?: string;
  cancelled?: boolean;
  /** Minutes before start for a reminder alarm. */
  alarmMinutes?: number;
};

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Fold lines longer than 75 octets, as the spec requires. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildCalendar(name: string, events: IcsEvent[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bridging Agent//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(name)}`,
  ];
  for (const e of events) {
    const end = new Date(e.start.getTime() + e.durationMinutes * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `SEQUENCE:${e.sequence}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escape(e.summary)}`,
      `DESCRIPTION:${escape(e.description)}`,
      `LOCATION:${escape(e.location)}`,
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    );
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.alarmMinutes && !e.cancelled) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escape(e.summary)}`,
        `TRIGGER:-PT${e.alarmMinutes}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
