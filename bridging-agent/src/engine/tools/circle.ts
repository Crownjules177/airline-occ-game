import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { defineTool } from "./define";
import { requireMember } from "../context";
import { participants, profiles, type Profile } from "../db/schema";
import { valuesOf } from "../values";
import type { Template } from "../template";

/**
 * The group as a circle of circles: each participant (a household, for meals) with the people in
 * it, the shared answers that say something about them, and threads to others who share something.
 *
 * Only answers the participant shared with the whole group are used, for everyone including the
 * host and the participant themselves, so what you see of yourself here is what others see.
 */

type Shared = (profile: Profile | undefined, key: string | undefined) => string[];

const shared: Shared = (profile, key) => {
  if (!profile || profile.status !== "approved" || !key) return [];
  const entry = profile.fields[key];
  return entry?.visibility === "group" ? valuesOf(entry.value).map(String).filter(Boolean) : [];
};

/** How a field reads in the circle: its highlight label ("Loves"), else the field's own label. */
function fieldLabel(t: Template, key: string) {
  return t.circle?.highlights.find((h) => h.field === key)?.label ?? t.profileFields.find((f) => f.key === key)?.label ?? key;
}

export const getCircle = defineTool({
  name: "get_circle",
  description:
    "The group as a circle: every participant with the names of the people in it, highlights from the answers they shared with the group, and threads to others who share a taste or could learn from each other.",
  layer: "group",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { me, space, template } = await requireMember(ctx, spaceId);
    const c = template.circle;
    const people = await ctx.db
      .select()
      .from(participants)
      .where(eq(participants.spaceId, spaceId))
      .orderBy(asc(participants.createdAt));
    const profs = await ctx.db.select().from(profiles).where(eq(profiles.spaceId, spaceId));

    const households = people.map((p, i) => {
      const profile = profs.find((x) => x.participantId === p.id);
      const joined = profile?.status === "approved";
      const members = template.participantUnit === "individual" ? [p.displayName] : shared(profile, c?.membersField);
      const sizeValue = Number(shared(profile, c?.sizeField)[0]);
      const size = Math.max(members.length, Number.isFinite(sizeValue) && sizeValue > 0 ? Math.min(sizeValue, 12) : 1);
      const summary = joined && profile.summary.trim() ? profile.summary : null;
      return {
        id: p.id,
        name: p.displayName,
        isMe: p.id === me.id,
        joined,
        /** Stable colour slot, in joining order. */
        hue: i,
        members,
        size,
        summary,
        highlights: (c?.highlights ?? [])
          .map((h) => ({ label: h.label, values: shared(profile, h.field) }))
          .filter((h) => h.values.length),
      };
    });

    // Threads: values two participants share across the thread fields, with how each relates to
    // it (both "Loves" Italian; one "Loves" dumplings and the other "Wants to learn" them).
    const threadFields = c?.threadFields ?? [];
    const index = new Map(
      people.map((p) => {
        const profile = profs.find((x) => x.participantId === p.id);
        return [p.id, threadFields.flatMap((field) => shared(profile, field).map((v) => ({ field, value: v, key: v.toLowerCase() })))];
      }),
    );
    type Link = { value: string; a: string; b: string };
    const threads: { a: string; b: string; shared: Link[] }[] = [];
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const [A, B] = [people[i], people[j]];
        const links = new Map<string, Link>();
        for (const x of index.get(A.id)!) {
          for (const y of index.get(B.id)!) {
            if (x.key !== y.key) continue;
            const link = { value: x.value, a: fieldLabel(template, x.field), b: fieldLabel(template, y.field) };
            links.set(`${x.key}|${link.a}|${link.b}`, link);
          }
        }
        if (links.size) threads.push({ a: A.id, b: B.id, shared: [...links.values()] });
      }
    }

    return {
      space: { name: space.name },
      unit: template.unitLabel,
      individual: template.participantUnit === "individual",
      membersField: c?.membersField ?? null,
      households,
      threads,
    };
  },
});
