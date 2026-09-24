import { WEEKDAYS, type ProfileField, type Template, type Weekday } from "./template";
import type { FieldValue, Profile, ProfileFields } from "./db/schema";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const DAY_PATTERNS: [Weekday, RegExp][] = [
  ["Mon", /\bmon(day)?s?\b/i],
  ["Tue", /\btue(s|sday)?s?\b/i],
  ["Wed", /\bwed(nesday)?s?\b/i],
  ["Thu", /\bthu(r|rs|rsday)?s?\b/i],
  ["Fri", /\bfri(day)?s?\b/i],
  ["Sat", /\bsat(urday)?s?\b/i],
  ["Sun", /\bsun(day)?s?\b/i],
];

const NONE = /^(none|no|nope|nothing|n\/a|not really|no allergies|nothing really)\.?$/i;

export function splitList(text: string): string[] {
  const t = text.trim();
  if (!t || NONE.test(t)) return [];
  return t
    .split(/,|;|\n|\band\b|&|\//i)
    .map((s) =>
      s
        .trim()
        .replace(/^(we|i)\s+(really\s+)?(love|like|avoid|want to learn|would love to learn|'d love to learn|prefer not to eat)\s+/i, "")
        .replace(/[.!]+$/, "")
        .trim(),
    )
    .filter((s) => s && !NONE.test(s));
}

export function parseWeekdays(text: string): Weekday[] {
  if (/\b(any|every)\s*(week)?night\b|\bweeknights\b/i.test(text)) return ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return DAY_PATTERNS.filter(([, re]) => re.test(text)).map(([d]) => d);
}

/** Parse free text into a field value. Used for participant edits and by the mock agent. */
export function parseFieldValue(field: ProfileField, text: string): FieldValue {
  const t = text.trim();
  switch (field.type) {
    case "text":
      return t || null;
    case "number": {
      // Prefer an explicit total ("four of us", "5 people"), else the first number.
      const total = t.match(/\b(\w+)\s+(of us|people|in total|altogether)\b/i)?.[1];
      if (total && (/^\d+$/.test(total) || NUMBER_WORDS[total.toLowerCase()])) {
        return /^\d+$/.test(total) ? Number(total) : NUMBER_WORDS[total.toLowerCase()];
      }
      const digits = t.match(/\d+/);
      if (digits) return Number(digits[0]);
      const word = Object.keys(NUMBER_WORDS).find((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
      return word ? NUMBER_WORDS[word] : null;
    }
    case "list":
      return splitList(t);
    case "weekdays":
      return parseWeekdays(t);
    case "choice": {
      const opts = field.options ?? [];
      return opts.find((o) => t.toLowerCase() === o.toLowerCase()) ??
        opts.find((o) => new RegExp(`\\b${escapeRe(o)}\\b`, "i").test(t)) ??
        null;
    }
    case "multi":
      return (field.options ?? []).filter((o) => new RegExp(`\\b${escapeRe(o)}s?\\b`, "i").test(t));
  }
}

/** Coerce a structured value (from the model or an edit form) into the field's type. */
export function normaliseFieldValue(field: ProfileField, value: unknown): FieldValue {
  if (value == null) return field.type === "list" || field.type === "multi" || field.type === "weekdays" ? [] : null;
  if (typeof value === "string") return parseFieldValue(field, value);
  if (field.type === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    const strings = value.map(String).map((s) => s.trim()).filter(Boolean);
    if (field.type === "weekdays") return WEEKDAYS.filter((d) => strings.includes(d));
    if (field.type === "multi") return (field.options ?? []).filter((o) => strings.some((s) => s.toLowerCase() === o.toLowerCase()));
    if (field.type === "list") return [...new Set(strings)];
    return strings.join(", ") || null;
  }
  return null;
}

export function formatValue(value: FieldValue): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function isEmpty(value: FieldValue): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function valuesOf(value: FieldValue): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  return [String(value)];
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Constraints ----------------------------------------------------------------------------

/**
 * Hard constraints across approved profiles, whatever each field's visibility. They are only
 * ever shown as anonymous labels ("Allergy: tree nuts"), never linked to a participant.
 * `forbidden` holds terms that must not appear in a proposal's themes (from "no X" values and
 * from agent-only fields such as allergies).
 */
export function hardConstraints(template: Template, approved: Pick<Profile, "fields">[]) {
  const labels = new Map<string, string>();
  const forbidden = new Set<string>();
  for (const field of template.profileFields.filter((f) => f.constraint === "hard")) {
    for (const p of approved) {
      for (const v of valuesOf(p.fields[field.key]?.value ?? null)) {
        const value = v.trim();
        if (!value) continue;
        const key = `${field.key}:${value.toLowerCase()}`;
        if (!labels.has(key)) labels.set(key, `${singular(field.label)}: ${value.toLowerCase()}`);
        const no = value.match(/^(no|without)\s+(.+)$/i);
        if (no) forbidden.add(no[2].toLowerCase());
        else if (field.defaultVisibility === "agent") forbidden.add(value.toLowerCase());
      }
    }
  }
  return { labels: [...labels.values()].sort(), forbidden: [...forbidden] };
}

/** Terms from `forbidden` that appear in the text. */
export function constraintConflicts(text: string, forbidden: string[]): string[] {
  const lower = text.toLowerCase();
  return forbidden.filter((term) => {
    const stem = term.replace(/s$/, "");
    return new RegExp(`\\b${escapeRe(stem)}`, "i").test(lower);
  });
}

function singular(label: string) {
  return label.replace(/ies$/, "y").replace(/s$/, "");
}

export function fieldsWithDefaults(template: Template, values: Record<string, FieldValue>): ProfileFields {
  return Object.fromEntries(
    template.profileFields.map((f) => [f.key, { value: normaliseFieldValue(f, values[f.key]), visibility: f.defaultVisibility }]),
  );
}
