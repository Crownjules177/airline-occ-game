import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "./db/client";
import { contributions, participants, profiles, type Participant, type Profile } from "./db/schema";
import type { Template, Weekday } from "./template";
import { formatValue, hardConstraints, isEmpty, valuesOf } from "./values";
import type { SharedContribution } from "./agent/stages";

/** Group state the agent works from. Only shared (group-visible) content is attributed. */
export async function loadGroup(db: DB, spaceId: string, template: Template) {
  const people = await db.select().from(participants).where(eq(participants.spaceId, spaceId));
  const profs = await db.select().from(profiles).where(eq(profiles.spaceId, spaceId));
  const approved = profs.filter((p) => p.status === "approved");
  const byId = new Map(people.map((p) => [p.id, p]));
  const approvedById = new Map(approved.map((p) => [p.participantId, p]));

  const rows = await db
    .select()
    .from(contributions)
    .where(and(eq(contributions.spaceId, spaceId), eq(contributions.visibility, "group")));

  const shared: SharedContribution[] = rows
    .filter((c) => c.kind === "profile_field" && c.participantId && approvedById.has(c.participantId))
    .map((c) => ({
      id: c.id,
      author: byId.get(c.participantId!)?.displayName ?? "Unknown",
      field: c.fieldKey,
      text: c.body,
      values: valuesOf(approvedById.get(c.participantId!)!.fields[c.fieldKey!]?.value ?? null),
    }));
  const ideas: SharedContribution[] = rows
    .filter((c) => c.kind === "idea")
    .map((c) => ({ id: c.id, author: byId.get(c.participantId ?? "")?.displayName ?? "Unknown", field: null, text: c.body, values: [] }));

  // Availability is an anonymous count, so it may use fields of any visibility.
  const availability: Partial<Record<Weekday, number>> = {};
  const key = template.proposal.availabilityField;
  if (key) {
    for (const p of approved) {
      for (const d of valuesOf(p.fields[key]?.value ?? null)) availability[d as Weekday] = (availability[d as Weekday] ?? 0) + 1;
    }
  }

  return {
    people,
    profiles: profs,
    approved,
    shared,
    ideas,
    availability,
    constraints: hardConstraints(template, approved),
    privatePairs: privatePairs(people, approved),
  };
}

/** (name, value) pairs from non-group fields. Agent output that puts both together is a leak. */
function privatePairs(people: Participant[], approved: Profile[]) {
  const pairs: { name: string; value: string }[] = [];
  for (const p of approved) {
    const name = people.find((x) => x.id === p.participantId)?.displayName;
    if (!name) continue;
    for (const f of Object.values(p.fields)) {
      if (f.visibility === "group") continue;
      for (const v of valuesOf(f.value)) if (String(v).trim().length > 2) pairs.push({ name, value: String(v) });
    }
  }
  return pairs;
}

/** Server-side guard: does this text link a named participant to one of their private values? */
export function leaksPrivate(text: string, pairs: { name: string; value: string }[]) {
  const lower = text.toLowerCase();
  return pairs.some((p) => lower.includes(p.name.toLowerCase()) && lower.includes(p.value.toLowerCase()));
}

/**
 * Keep one `profile_field` contribution per shared, non-empty field of an approved profile, so the
 * map and proposals can cite it. Fields made private or emptied lose their contribution.
 */
export async function syncProfileContributions(db: DB, template: Template, profile: Profile, spaceId: string, newId: () => string) {
  const existing = await db
    .select()
    .from(contributions)
    .where(and(eq(contributions.participantId, profile.participantId), eq(contributions.kind, "profile_field")));
  const keep = new Set<string>();
  for (const f of template.profileFields) {
    const entry = profile.fields[f.key];
    if (!entry || entry.visibility !== "group" || isEmpty(entry.value)) continue;
    const body = `${f.label}: ${formatValue(entry.value)}`;
    const current = existing.find((c) => c.fieldKey === f.key);
    if (current) {
      keep.add(current.id);
      if (current.body !== body) await db.update(contributions).set({ body }).where(eq(contributions.id, current.id));
    } else {
      await db.insert(contributions).values({
        id: newId(),
        spaceId,
        participantId: profile.participantId,
        kind: "profile_field",
        body,
        fieldKey: f.key,
        visibility: "group",
      });
    }
  }
  const stale = existing.filter((c) => !keep.has(c.id)).map((c) => c.id);
  if (stale.length) await db.delete(contributions).where(inArray(contributions.id, stale));
}
