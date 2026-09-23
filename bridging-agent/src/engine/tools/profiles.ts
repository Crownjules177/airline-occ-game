import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { defineTool } from "./define";
import { actorType, audit, requireMember, ToolError } from "../context";
import { participants, profileRevisions, profiles, type ProfileFields } from "../db/schema";
import { VISIBILITIES } from "../template";
import { normaliseFieldValue } from "../values";
import { visibleProfile } from "../visibility";
import { syncProfileContributions } from "../group";
import { newId } from "../ids";

export const getMyProfile = defineTool({
  name: "get_my_profile",
  description: "Get the caller's own profile exactly as stored, every field with its visibility, plus the edit history.",
  layer: "personal",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { me, template } = await requireMember(ctx, spaceId);
    const [profile] = await ctx.db.select().from(profiles).where(eq(profiles.participantId, me.id));
    if (!profile) return { profile: null, fields: template.profileFields, history: [] };
    const history = await ctx.db
      .select({ version: profileRevisions.version, editedBy: profileRevisions.editedBy, createdAt: profileRevisions.createdAt })
      .from(profileRevisions)
      .where(eq(profileRevisions.profileId, profile.id))
      .orderBy(desc(profileRevisions.version));
    return { profile, fields: template.profileFields, history };
  },
});

export const updateMyProfile = defineTool({
  name: "update_my_profile",
  description:
    "Edit the caller's own profile: field values, per-field visibility (group, host, agent) and the summary. Optionally approve it in the same call.",
  layer: "personal",
  input: z.object({
    spaceId: z.string(),
    summary: z.string().trim().max(2000).optional(),
    fields: z
      .record(z.string(), z.object({ value: z.unknown().optional(), visibility: z.enum(VISIBILITIES).optional() }))
      .optional(),
    approve: z.boolean().optional(),
  }),
  run: async (ctx, input) => {
    const m = await requireMember(ctx, input.spaceId);
    const [profile] = await ctx.db.select().from(profiles).where(eq(profiles.participantId, m.me.id));
    if (!profile) throw new ToolError("Finish the intake chat first, then draft your profile.");

    const fields: ProfileFields = structuredClone(profile.fields);
    for (const [key, change] of Object.entries(input.fields ?? {})) {
      const def = m.template.profileFields.find((f) => f.key === key);
      if (!def) throw new ToolError(`Unknown field: ${key}`);
      const entry = fields[key] ?? { value: null, visibility: def.defaultVisibility };
      if ("value" in change) entry.value = normaliseFieldValue(def, change.value);
      if (change.visibility) entry.visibility = change.visibility;
      fields[key] = entry;
    }
    const summary = input.summary ?? profile.summary;
    const changed = JSON.stringify(fields) !== JSON.stringify(profile.fields) || summary !== profile.summary;
    const version = changed ? profile.version + 1 : profile.version;
    const status = input.approve ? "approved" : profile.status;

    const [updated] = await ctx.db
      .update(profiles)
      .set({
        fields,
        summary,
        version,
        status,
        updatedAt: ctx.now,
        ...(input.approve && profile.status !== "approved" && { approvedAt: ctx.now }),
      })
      .where(eq(profiles.id, profile.id))
      .returning();
    if (changed) {
      await ctx.db.insert(profileRevisions).values({ id: newId(), profileId: profile.id, version, fields, summary, editedBy: "participant" });
    }
    if (updated.status === "approved") await syncProfileContributions(ctx.db, m.template, updated, input.spaceId, newId);
    await audit(ctx, {
      spaceId: input.spaceId,
      actorType: actorType(m),
      actorId: m.me.id,
      action: input.approve ? "profile.approved" : "profile.edited",
      detail: { version, edited: changed },
    });
    return { profile: updated };
  },
});

export const getGroupProfiles = defineTool({
  name: "get_group_profiles",
  description:
    "Get every participant's profile as the caller is allowed to see it. Unapproved profiles show no content; host-only fields appear only for the host; agent-only fields never appear.",
  layer: "group",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { me, template, isHost } = await requireMember(ctx, spaceId);
    const people = await ctx.db.select().from(participants).where(eq(participants.spaceId, spaceId));
    const profs = await ctx.db.select().from(profiles).where(eq(profiles.spaceId, spaceId));
    const viewer = { participantId: me.id, isHost };
    return people.map((p) => visibleProfile(viewer, p, profs.find((x) => x.participantId === p.id), template));
  },
});
