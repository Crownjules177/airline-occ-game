import { WEEKDAYS, type Weekday } from "./template";
import type { Schedule } from "./db/schema";

// Dates are handled as local calendar dates (YYYY-MM-DD) in the space's timezone, and only
// converted to instants when an event is stored. No date library needed.

const pad = (n: number) => String(n).padStart(2, "0");

export function parseDate(s: string): { y: number; m: number; d: number } | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1) return null;
  return { y, m: mo, d };
}

export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const asUtcDate = (s: string) => {
  const p = parseDate(s)!;
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
};

export function weekdayOf(s: string): Weekday {
  return WEEKDAYS[(asUtcDate(s).getUTCDay() + 6) % 7];
}

export function addDays(s: string, days: number): string {
  const d = asUtcDate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

/** Today's date in a timezone. */
export function localToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** First date on or after `from` that falls on `weekday`. */
export function nextWeekday(from: string, weekday: Weekday): string {
  let d = from;
  for (let i = 0; i < 7 && weekdayOf(d) !== weekday; i++) d = addDays(d, 1);
  return d;
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - instant.getTime();
}

/** Convert a local date and HH:MM in a timezone to an instant. */
export function zonedTime(date: string, time: string, timeZone: string): Date {
  const p = parseDate(date)!;
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(p.y, p.m - 1, p.d, hh, mm);
  let instant = guess - tzOffsetMs(new Date(guess), timeZone);
  // Second pass settles DST boundaries.
  instant = guess - tzOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** The same weekday in the nth week of the following month (capped at the 4th, so it always exists). */
function nextMonthly(date: string): string {
  const d = asUtcDate(date);
  const nth = Math.min(Math.ceil(d.getUTCDate() / 7), 4);
  const weekday = weekdayOf(date);
  const first = formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  return addDays(nextWeekday(first, weekday), (nth - 1) * 7);
}

/** Expand a schedule into local dates. */
export function expandSchedule(s: Schedule): string[] {
  const dates: string[] = [];
  let d = nextWeekday(s.startDate, s.weekday as Weekday);
  for (let i = 0; i < s.occurrences; i++) {
    dates.push(d);
    d = s.cadence === "weekly" ? addDays(d, 7) : s.cadence === "fortnightly" ? addDays(d, 14) : nextMonthly(d);
  }
  return dates;
}
