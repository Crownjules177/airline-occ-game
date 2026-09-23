import type { Commitment, EventRow, Participant, Profile } from "./db/schema";
import { WEEKDAYS, type Template } from "./template";
import { valuesOf } from "./values";

export type Suggestion = {
  commitmentId: string;
  participantId: string;
  /** Reasons, each tagged with the field it came from so callers can filter by visibility. */
  reasons: { text: string; fieldKey: string | null }[];
};

/**
 * Suggest who could take each open task, balancing load and fitting profiles (FR4.2).
 * Deterministic and explainable on purpose: no model call, the same inputs give the same
 * suggestions, and every suggestion says why. Suggestions are only offers; people claim.
 */
export function suggestAssignments(opts: {
  template: Template;
  timezone: string;
  events: EventRow[];
  commitments: Commitment[];
  participants: Participant[];
  profiles: Profile[];
}): Suggestion[] {
  const { template, events, commitments, participants, profiles } = opts;
  const partsKey = template.proposal.partsField;
  const daysKey = template.proposal.availabilityField;
  const eligible = participants.filter((p) => profiles.some((x) => x.participantId === p.id && x.status === "approved"));
  const load = new Map(eligible.map((p) => [p.id, 0]));
  for (const c of commitments) if (c.participantId && load.has(c.participantId)) load.set(c.participantId, load.get(c.participantId)! + 1);

  const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: opts.timezone, weekday: "short" });
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const busyAt = new Map<string, Set<string>>(); // eventId -> participants already doing something
  for (const c of commitments) {
    if (!c.participantId) continue;
    const set = busyAt.get(c.eventId) ?? new Set();
    set.add(c.participantId);
    busyAt.set(c.eventId, set);
  }

  const open = commitments
    .filter((c) => c.status === "open" && eventsById.has(c.eventId))
    .sort((a, b) => eventsById.get(a.eventId)!.startsAt.getTime() - eventsById.get(b.eventId)!.startsAt.getTime());

  const out: Suggestion[] = [];
  for (const c of open) {
    const event = eventsById.get(c.eventId)!;
    const day = weekdayFmt.format(event.startsAt).slice(0, 3);
    let best: { p: Participant; score: number; reasons: Suggestion["reasons"] } | null = null;
    for (const p of eligible) {
      const profile = profiles.find((x) => x.participantId === p.id)!;
      const reasons: Suggestion["reasons"] = [];
      let score = -3 * load.get(p.id)!;
      if (busyAt.get(event.id)?.has(p.id)) score -= 10;
      if (partsKey) {
        const enjoyed = valuesOf(profile.fields[partsKey]?.value ?? null).map((v) => v.toLowerCase());
        if (enjoyed.includes(c.part.toLowerCase())) {
          score += 4;
          reasons.push({ text: `enjoys making ${c.part.toLowerCase()}`, fieldKey: partsKey });
        }
      }
      if (daysKey && WEEKDAYS.includes(day as never)) {
        const free = valuesOf(profile.fields[daysKey]?.value ?? null);
        if (free.includes(day)) {
          score += 3;
          reasons.push({ text: `usually free on ${day}`, fieldKey: daysKey });
        } else if (free.length) score -= 5;
      }
      if (!best || score > best.score || (score === best.score && p.id < best.p.id)) best = { p, score, reasons };
    }
    if (!best) continue;
    reasonsFill(best.reasons, load.get(best.p.id)!);
    out.push({ commitmentId: c.id, participantId: best.p.id, reasons: best.reasons });
    load.set(best.p.id, load.get(best.p.id)! + 1);
    const set = busyAt.get(event.id) ?? new Set();
    set.add(best.p.id);
    busyAt.set(event.id, set);
  }
  return out;
}

function reasonsFill(reasons: Suggestion["reasons"], load: number) {
  reasons.push({ text: load === 0 ? "hasn't taken anything yet" : `keeps load even (${load} so far)`, fieldKey: null });
}
