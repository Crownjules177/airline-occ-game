import type { Schedule } from "./db/schema";
import { addDays, cadenceDates, nextWeekday } from "./schedule";
import { formatDateValue } from "./dates";
import type { Weekday } from "./template";

/** Households away on each date (anonymous counts), keyed by YYYY-MM-DD. */
export type AwayCounts = Record<string, number>;

/** A date is skipped when more than this share of households are away. */
const SKIP_SHARE = 1 / 3;

/**
 * Choose a start date and the dates to skip so as many households as possible can come.
 * Tries the first four possible start weeks; prefers fewer absences, then fewer skips, then
 * starting sooner. Deterministic, so the same inputs always give the same dates.
 */
export function fitSchedule(
  s: Pick<Schedule, "weekday" | "cadence" | "occurrences">,
  earliest: string,
  away: AwayCounts,
  households: number,
): { startDate: string; skipDates: string[] } {
  const first = nextWeekday(earliest, s.weekday as Weekday);
  let best: { startDate: string; skipDates: string[]; score: number } | null = null;
  for (let k = 0; k < 4; k++) {
    const startDate = addDays(first, 7 * k);
    const kept: string[] = [];
    const skipDates: string[] = [];
    let absences = 0;
    let guard = 0;
    for (const d of cadenceDates({ ...s, startDate })) {
      if (kept.length >= s.occurrences || guard++ > s.occurrences + 26) break;
      const n = away[d] ?? 0;
      if (households > 0 && n / households > SKIP_SHARE) skipDates.push(d);
      else {
        kept.push(d);
        absences += n;
      }
    }
    const score = absences * 10 + skipDates.length * 3 + k;
    if (!best || score < best.score) best = { startDate, skipDates, score };
  }
  return { startDate: best!.startDate, skipDates: best!.skipDates };
}

/** One plain line describing known absences across a set of dates, for trade-offs. */
export function absenceSummary(dates: string[], away: AwayCounts, unit: { singular: string; plural: string }): string {
  const clashes = dates.filter((d) => (away[d] ?? 0) > 0);
  if (!clashes.length) return `No ${unit.singular} has said they're away on any of these dates.`;
  return `Known absences: ${clashes
    .map((d) => `${formatDateValue(d)} (${away[d]} ${away[d] === 1 ? unit.singular : unit.plural} away)`)
    .join(", ")}.`;
}

/** True for a trade-off line written by absenceSummary (so it can be replaced, not duplicated). */
export function isAbsenceLine(line: string): boolean {
  return /^Known absences: /.test(line) || /^No \w+ has said they're away on any of these dates\.$/.test(line);
}
