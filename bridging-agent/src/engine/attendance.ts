import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "./db/client";
import { eventAttendance, participants, type EventAttendance } from "./db/schema";
import { isAway } from "./dates";
import { addDays, weekdayOf } from "./schedule";
import type { Weekday } from "./template";

/**
 * Who can come to each date. A household's answer on the plan ("can't make this one" or "actually
 * we can") wins; otherwise the away dates on their profile count. Only counts leave this module.
 */

/** A date needs attention when fewer than this share of households can come. */
export const MIN_COMING_SHARE = 0.6;

export const minComing = (households: number) => Math.ceil(households * MIN_COMING_SHARE);

export type Roster = {
  households: string[];
  /** Profile away dates per participant. */
  profileAway: Map<string, string[]>;
  answers: EventAttendance[];
};

export async function loadRoster(db: DB, spaceId: string, eventIds: string[], profileAway: Map<string, string[]>): Promise<Roster> {
  const people = await db.select({ id: participants.id }).from(participants).where(eq(participants.spaceId, spaceId));
  const answers = eventIds.length
    ? await db.select().from(eventAttendance).where(and(eq(eventAttendance.spaceId, spaceId), inArray(eventAttendance.eventId, eventIds)))
    : [];
  return { households: people.map((p) => p.id), profileAway, answers };
}

export function answerFor(r: Roster, eventId: string, participantId: string) {
  return r.answers.find((a) => a.eventId === eventId && a.participantId === participantId)?.status ?? null;
}

/** Whether a household is away for an event on a local date. */
export function isAwayFor(r: Roster, eventId: string | null, date: string, participantId: string) {
  const answer = eventId ? answerFor(r, eventId, participantId) : null;
  if (answer) return answer === "away";
  return isAway(date, r.profileAway.get(participantId) ?? []);
}

export function headcount(r: Roster, eventId: string | null, date: string) {
  const away = r.households.filter((p) => isAwayFor(r, eventId, date, p)).length;
  const total = r.households.length;
  return { total, away, coming: total - away, low: total > 0 && total - away < minComing(total) };
}

export type DateOption = { date: string; weekday: Weekday; coming: number; total: number; sameWeekday: boolean; keepsParts: number };

/**
 * Nearby dates for a meal, best first: most households free (by their profile away dates and the
 * nights they said suit them), then the same weekday, then closest to the original.
 */
export function suggestDates(opts: {
  roster: Roster;
  date: string;
  today: string;
  takenDates: string[];
  claimedBy: string[];
  availability: Map<string, string[]>;
  window?: number;
  limit?: number;
}): DateOption[] {
  const { roster, date, today, window = 14, limit = 3 } = opts;
  const weekday = weekdayOf(date);
  const taken = new Set(opts.takenDates);
  const options: (DateOption & { distance: number; suits: number })[] = [];
  for (let i = -window; i <= window; i++) {
    const d = addDays(date, i);
    if (i === 0 || d <= today || taken.has(d)) continue;
    const { coming, total } = headcount(roster, null, d);
    const wd = weekdayOf(d);
    const suits = roster.households.filter((p) => opts.availability.get(p)?.includes(wd)).length;
    const keepsParts = opts.claimedBy.filter((p) => !isAwayFor(roster, null, d, p)).length;
    options.push({ date: d, weekday: wd, coming, total, sameWeekday: wd === weekday, keepsParts, distance: Math.abs(i), suits });
  }
  options.sort(
    (a, b) =>
      b.coming - a.coming ||
      b.keepsParts - a.keepsParts ||
      Number(b.sameWeekday) - Number(a.sameWeekday) ||
      b.suits - a.suits ||
      a.distance - b.distance ||
      a.date.localeCompare(b.date),
  );
  return options.slice(0, limit).map(({ distance: _d, suits: _s, ...o }) => o);
}
