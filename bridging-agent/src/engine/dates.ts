import { parseDate } from "./schedule";

/**
 * Specific dates a participant can't make. Stored as ISO strings: a single day "2026-10-15" or an
 * inclusive range "2026-12-10/2026-12-20" (ISO 8601 interval notation).
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const TO = "\\s*(?:-|–|—|to|until|till|through)\\s*";

export type DateRange = { from: string; to: string };

export function parseDateValue(s: string): DateRange | null {
  const [a, b] = s.trim().split("/");
  if (!ISO.test(a) || !parseDate(a)) return null;
  if (b === undefined) return { from: a, to: a };
  if (!ISO.test(b) || !parseDate(b)) return null;
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

const toValue = (r: DateRange) => (r.from === r.to ? r.from : `${r.from}/${r.to}`);

/** Validate, order and de-duplicate stored date values. */
export function normaliseDates(values: string[]): string[] {
  const ranges = values.map(parseDateValue).filter((r): r is DateRange => !!r);
  return [...new Set(ranges.map(toValue))].sort();
}

export function isAway(date: string, values: string[]): boolean {
  return values.some((v) => {
    const r = parseDateValue(v);
    return !!r && r.from <= date && date <= r.to;
  });
}

/** Values that haven't fully passed yet. */
export function upcoming(values: string[], today: string): string[] {
  return values.filter((v) => (parseDateValue(v)?.to ?? "") >= today);
}

const pad = (n: number) => String(n).padStart(2, "0");

function short(iso: string, withMonth = true) {
  const p = parseDate(iso)!;
  return withMonth ? `${p.d} ${MONTH_NAMES[p.m - 1]}` : `${p.d}`;
}

/** "15 Oct", "10–20 Dec", "28 Dec – 3 Jan". */
export function formatDateValue(v: string): string {
  const r = parseDateValue(v);
  if (!r) return v;
  if (r.from === r.to) return short(r.from);
  const sameMonth = r.from.slice(0, 7) === r.to.slice(0, 7);
  return sameMonth ? `${short(r.from, false)}–${short(r.to)}` : `${short(r.from)} – ${short(r.to)}`;
}

/** The next occurrence of day/month on or after today. */
function resolve(day: number, month: number, today: string): string | null {
  const t = parseDate(today)!;
  let year = t.y;
  if (`${pad(month)}-${pad(day)}` < today.slice(5)) year++;
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return parseDate(iso) ? iso : null;
}

function range(d1: number, m1: number, d2: number, m2: number, today: string): DateRange | null {
  const from = resolve(d1, m1, today);
  if (!from) return null;
  let to = resolve(d2, m2, today);
  if (!to) return null;
  // A range that wraps the new year ("28 Dec to 3 Jan") ends the following year.
  if (to < from) to = `${Number(to.slice(0, 4)) + 1}${to.slice(4)}`;
  return { from, to };
}

/**
 * Pull dates out of a free-text answer ("away 10–20 Dec and on the 15th of October").
 * Used for typed edits and by the mock agent; Claude returns ISO values directly.
 */
export function parseDatesFromText(text: string, today: string): string[] {
  let t = text.toLowerCase();
  const found: DateRange[] = [];
  const take = (re: RegExp, fn: (m: RegExpExecArray) => DateRange | null) => {
    t = t.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const r = fn(m);
      if (r) found.push(r);
      return " ";
    });
  };
  const month = (s: string) => MONTHS[s.slice(0, s.startsWith("sept") ? 4 : 3)];

  // 2026-12-10 or 2026-12-10 to 2026-12-20
  take(new RegExp(`(\\d{4}-\\d{2}-\\d{2})(?:${TO}(\\d{4}-\\d{2}-\\d{2}))?`, "g"), (m) => parseDateValue(m[2] ? `${m[1]}/${m[2]}` : m[1]));
  // 10 Dec, 10-20 Dec, 10th of December, 28 Dec to 3 Jan
  take(
    new RegExp(`\\b${DAY}(?:${TO}${DAY})?\\s+(?:of\\s+)?${MONTH}\\b(?:${TO}${DAY}\\s+(?:of\\s+)?${MONTH}\\b)?`, "g"),
    (m) => {
      const m1 = month(m[3]);
      if (m[4] && m[5]) return range(+m[1], m1, +m[4], month(m[5]), today);
      return range(+m[1], m1, +(m[2] ?? m[1]), m1, today);
    },
  );
  // Dec 10, Dec 10-20, Dec 28 to Jan 3
  take(new RegExp(`\\b${MONTH}\\s+${DAY}\\b(?:${TO}(?:${MONTH}\\s+)?${DAY}\\b)?`, "g"), (m) => {
    const m1 = month(m[1]);
    if (!m[3]) return range(+m[2], m1, +m[2], m1, today);
    return range(+m[2], m1, +m[4], m[3] ? month(m[3]) : m1, today);
  });
  return normaliseDates(found.map(toValue));
}
