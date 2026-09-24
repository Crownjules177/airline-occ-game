import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { defineTool } from "./define";
import { actorType, audit, requireHost, requireMember, ToolError } from "../context";
import { contributions, maps, participants, type MapItem } from "../db/schema";
import { mapStage } from "../agent/stages";
import { leaksPrivate, loadGroup } from "../group";
import { newId } from "../ids";
import { spaceStage } from "./spaces";

export const submitContribution = defineTool({
  name: "submit_contribution",
  description: "Share an idea or comment with the group. It is credited to the caller.",
  layer: "personal",
  input: z.object({
    spaceId: z.string(),
    kind: z.enum(["idea", "comment"]),
    body: z.string().trim().min(1).max(2000),
  }),
  run: async (ctx, input) => {
    const m = await requireMember(ctx, input.spaceId);
    const id = newId();
    await ctx.db.insert(contributions).values({
      id,
      spaceId: input.spaceId,
      participantId: m.me.id,
      kind: input.kind,
      body: input.body,
      visibility: "group",
    });
    await audit(ctx, { spaceId: input.spaceId, actorType: actorType(m), actorId: m.me.id, action: `contribution.${input.kind}` });
    return { contributionId: id };
  },
});

export const getMap = defineTool({
  name: "get_map",
  description:
    "Get the current group map. Every item carries the shared contributions behind it, with their authors, so anyone can trace it to its source.",
  layer: "group",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { template } = await requireMember(ctx, spaceId);
    const [map] = await ctx.db
      .select()
      .from(maps)
      .where(and(eq(maps.spaceId, spaceId), eq(maps.current, true)));
    if (!map) return { map: null, kinds: template.map.outputs, sources: {}, feedback: [] };
    const ids = [...new Set(map.items.flatMap((i) => i.sourceContributionIds))];
    const rows = ids.length
      ? await ctx.db
          .select({ id: contributions.id, body: contributions.body, kind: contributions.kind, author: participants.displayName })
          .from(contributions)
          .leftJoin(participants, eq(participants.id, contributions.participantId))
          .where(and(inArray(contributions.id, ids), eq(contributions.visibility, "group")))
      : [];
    const feedback = await ctx.db
      .select({ id: contributions.id, refId: contributions.refId, body: contributions.body, author: participants.displayName, createdAt: contributions.createdAt })
      .from(contributions)
      .leftJoin(participants, eq(participants.id, contributions.participantId))
      .where(and(eq(contributions.spaceId, spaceId), eq(contributions.kind, "map_feedback"), eq(contributions.refType, `map:${map.id}`)));
    return {
      map: { id: map.id, version: map.version, items: map.items, constraints: map.constraints, createdAt: map.createdAt },
      kinds: template.map.outputs,
      sources: Object.fromEntries(rows.map((r) => [r.id, r])),
      feedback,
    };
  },
});

export const generateMap = defineTool({
  name: "generate_map",
  description:
    "Host: have the agent build (or revise) the group map from approved profiles, ideas and feedback on the previous map. Needs the approval threshold unless forced.",
  layer: "host",
  input: z.object({ spaceId: z.string(), force: z.boolean().default(false) }),
  run: async (ctx, { spaceId, force }) => {
    const m = await requireHost(ctx, spaceId);
    const group = await loadGroup(ctx.db, spaceId, m.template);
    const pct = group.people.length ? (100 * group.approved.length) / group.people.length : 0;
    if (!group.approved.length) throw new ToolError("No approved profiles yet.");
    if (pct < m.space.settings.mapThresholdPercent && !force) {
      throw new ToolError(
        `${group.approved.length} of ${group.people.length} profiles approved (${Math.round(pct)}%). The map needs ${m.space.settings.mapThresholdPercent}%.`,
        409,
      );
    }

    const [previous] = await ctx.db
      .select()
      .from(maps)
      .where(eq(maps.spaceId, spaceId))
      .orderBy(desc(maps.version))
      .limit(1);
    const feedback = previous
      ? await ctx.db
          .select({ refId: contributions.refId, body: contributions.body, author: participants.displayName })
          .from(contributions)
          .leftJoin(participants, eq(participants.id, contributions.participantId))
          .where(and(eq(contributions.kind, "map_feedback"), eq(contributions.refType, `map:${previous.id}`)))
      : [];

    const { output, callId } = await ctx.agent.run(mapStage, {
      spaceId,
      template: m.template,
      input: {
        participantCount: group.people.length,
        approvedCount: group.approved.length,
        sharedContributions: group.shared,
        ideas: group.ideas,
        constraints: group.constraints.labels,
        availability: group.availability,
        softConstraintFields: m.template.profileFields.filter((f) => f.constraint === "soft").map((f) => f.key),
        feedback: feedback.map((f) => ({
          mapItemTitle: previous?.items.find((i) => i.id === f.refId)?.title ?? "",
          note: f.body,
          author: f.author ?? "",
        })),
        previousItems: previous?.items.map(({ kind, title, detail }) => ({ kind, title, detail })) ?? [],
      },
    });

    // Enforce provenance and privacy on the server, whatever the model returned.
    const allowed = new Set([...group.shared, ...group.ideas].map((c) => c.id));
    const kinds = new Set(m.template.map.outputs.map((o) => o.kind));
    const dropped: string[] = [];
    const items: MapItem[] = [];
    for (const item of output.items) {
      if (!kinds.has(item.kind)) continue;
      if (leaksPrivate(`${item.title} ${item.detail}`, group.privatePairs)) {
        dropped.push(item.title);
        continue;
      }
      items.push({
        ...item,
        id: newId(),
        sourceContributionIds: item.kind === "constraint" ? [] : item.sourceContributionIds.filter((id) => allowed.has(id)),
      });
    }
    // Constraints are always present, from the data, not from the model.
    if (group.constraints.labels.length && kinds.has("constraint") && !items.some((i) => i.kind === "constraint")) {
      items.push({
        id: newId(),
        kind: "constraint",
        title: "Every event must respect",
        detail: group.constraints.labels.join("; "),
        sourceContributionIds: [],
        minority: false,
      });
    }

    await ctx.db.update(maps).set({ current: false }).where(eq(maps.spaceId, spaceId));
    const mapId = newId();
    await ctx.db.insert(maps).values({
      id: mapId,
      spaceId,
      version: (previous?.version ?? 0) + 1,
      items,
      constraints: group.constraints.labels,
      agentCallId: callId,
    });
    if (m.space.stage === "intake") await spaceStage(ctx, spaceId, "map");
    await audit(ctx, {
      spaceId,
      actorType: "agent",
      action: "map.generated",
      detail: { mapId, items: items.length, droppedForPrivacy: dropped, requestedBy: m.me.id, forced: force && pct < m.space.settings.mapThresholdPercent },
    });
    return { mapId, items: items.length, droppedForPrivacy: dropped.length };
  },
});

export const flagMapItem = defineTool({
  name: "flag_map_item",
  description: "Comment on a map item or flag it as inaccurate. The agent takes this into account when the map is revised.",
  layer: "group",
  input: z.object({ spaceId: z.string(), mapItemId: z.string(), note: z.string().trim().min(1).max(1000) }),
  run: async (ctx, input) => {
    const m = await requireMember(ctx, input.spaceId);
    const [map] = await ctx.db
      .select()
      .from(maps)
      .where(and(eq(maps.spaceId, input.spaceId), eq(maps.current, true)));
    if (!map?.items.some((i) => i.id === input.mapItemId)) throw new ToolError("That map item no longer exists.", 404);
    const id = newId();
    await ctx.db.insert(contributions).values({
      id,
      spaceId: input.spaceId,
      participantId: m.me.id,
      kind: "map_feedback",
      body: input.note,
      refType: `map:${map.id}`,
      refId: input.mapItemId,
      visibility: "group",
    });
    await audit(ctx, { spaceId: input.spaceId, actorType: actorType(m), actorId: m.me.id, action: "map.flagged", detail: { mapItemId: input.mapItemId } });
    return { contributionId: id };
  },
});
