import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { defineTool } from "./define";
import { actorType, audit, requireMember, ToolError, type ToolContext } from "../context";
import { commitments, events, participants, plans, profiles, proposals, spaces, type Participant } from "../db/schema";
import { suggestAssignments } from "../assign";
import { canSee } from "../visibility";
import { buildCalendar, type IcsEvent } from "../ics";
import { getTemplate } from "../template";

async function currentPlan(ctx: ToolContext, spaceId: string) {
  const [plan] = await ctx.db
    .select()
    .from(plans)
    .where(and(eq(plans.spaceId, spaceId), eq(plans.current, true)));
  return plan;
}

export const getPlan = defineTool({
  name: "get_plan",
  description:
    "Get the group's current plan as a calendar: every event, its parts, and who is doing what. Includes the caller's calendar feed URL.",
  layer: "group",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { me, template, space, isHost } = await requireMember(ctx, spaceId);
    const plan = await currentPlan(ctx, spaceId);
    const feedUrl = `${ctx.appUrl}/api/cal/${me.calendarToken}`;
    if (!plan) return { plan: null, events: [], feedUrl };
    const evs = await ctx.db.select().from(events).where(eq(events.planId, plan.id)).orderBy(asc(events.startsAt));
    const cs = evs.length
      ? await ctx.db.select().from(commitments).where(inArray(commitments.eventId, evs.map((e) => e.id)))
      : [];
    const people = await ctx.db.select().from(participants).where(eq(participants.spaceId, spaceId));
    const profs = await ctx.db.select().from(profiles).where(eq(profiles.spaceId, spaceId));
    const [proposal] = await ctx.db.select({ parts: proposals.parts }).from(proposals).where(eq(proposals.id, plan.proposalId));
    const order = (part: string) => proposal.parts.indexOf(part);
    const suggestions = suggestAssignments({ template, timezone: space.settings.timezone, events: evs, commitments: cs, participants: people, profiles: profs });
    const viewer = { participantId: me.id, isHost };
    const name = (id: string | null) => people.find((p) => p.id === id)?.displayName ?? null;
    return {
      plan,
      feedUrl,
      timezone: space.settings.timezone,
      taskNoun: template.act.taskNoun,
      events: evs.map((e) => ({
        ...e,
        commitments: cs
          .filter((c) => c.eventId === e.id)
          .sort((a, b) => order(a.part) - order(b.part))
          .map((c) => {
            const s = suggestions.find((x) => x.commitmentId === c.id);
            const owner = s && people.find((p) => p.id === s.participantId);
            const ownerProfile = s && profs.find((p) => p.participantId === s.participantId);
            // Only show a suggestion to the person it's for, or to the host; filter reasons by what they may see.
            const showSuggestion = s && owner && (s.participantId === me.id || isHost);
            return {
              ...c,
              who: name(c.participantId),
              mine: c.participantId === me.id,
              suggestion: showSuggestion
                ? {
                    participantId: s.participantId,
                    who: owner.displayName,
                    forMe: s.participantId === me.id,
                    reasons: s.reasons
                      .filter((r) => !r.fieldKey || canSee(viewer, owner as Participant, ownerProfile!.fields[r.fieldKey]?.visibility ?? "agent"))
                      .map((r) => r.text),
                  }
                : null,
          };
          }),
      })),
    };
  },
});

async function loadCommitment(ctx: ToolContext, spaceId: string, id: string) {
  const [c] = await ctx.db
    .select()
    .from(commitments)
    .where(and(eq(commitments.id, id), eq(commitments.spaceId, spaceId)));
  if (!c) throw new ToolError("Task not found.", 404);
  return c;
}

export const claimCommitment = defineTool({
  name: "claim_commitment",
  description: "Claim an open task (for example: bring the main to the meal on a date).",
  layer: "personal",
  input: z.object({ spaceId: z.string(), commitmentId: z.string() }),
  run: async (ctx, { spaceId, commitmentId }) => {
    const m = await requireMember(ctx, spaceId);
    await loadCommitment(ctx, spaceId, commitmentId);
    // Conditional update, so two people tapping at once can't both claim it.
    const updated = await ctx.db
      .update(commitments)
      .set({ participantId: m.me.id, status: "claimed", claimedAt: ctx.now, sequence: sql`${commitments.sequence} + 1` })
      .where(and(eq(commitments.id, commitmentId), eq(commitments.status, "open")))
      .returning();
    if (!updated.length) throw new ToolError("Someone has already claimed that.", 409);
    await audit(ctx, { spaceId, actorType: actorType(m), actorId: m.me.id, action: "commitment.claimed", detail: { commitmentId } });
    return { ok: true };
  },
});

export const releaseCommitment = defineTool({
  name: "release_commitment",
  description: "Give back a task the caller claimed, so someone else can take it.",
  layer: "personal",
  input: z.object({ spaceId: z.string(), commitmentId: z.string() }),
  run: async (ctx, { spaceId, commitmentId }) => {
    const m = await requireMember(ctx, spaceId);
    const c = await loadCommitment(ctx, spaceId, commitmentId);
    if (c.participantId !== m.me.id) throw new ToolError("That isn't yours.", 403);
    await ctx.db
      .update(commitments)
      .set({ participantId: null, status: "open", claimedAt: null, sequence: c.sequence + 1 })
      .where(eq(commitments.id, c.id));
    await audit(ctx, { spaceId, actorType: actorType(m), actorId: m.me.id, action: "commitment.released", detail: { commitmentId } });
    return { ok: true };
  },
});

export const completeCommitment = defineTool({
  name: "complete_commitment",
  description: "Mark one of the caller's tasks as done.",
  layer: "personal",
  input: z.object({ spaceId: z.string(), commitmentId: z.string() }),
  run: async (ctx, { spaceId, commitmentId }) => {
    const m = await requireMember(ctx, spaceId);
    const c = await loadCommitment(ctx, spaceId, commitmentId);
    if (c.participantId !== m.me.id) throw new ToolError("That isn't yours.", 403);
    await ctx.db.update(commitments).set({ status: "done" }).where(eq(commitments.id, c.id));
    await audit(ctx, { spaceId, actorType: actorType(m), actorId: m.me.id, action: "commitment.done", detail: { commitmentId } });
    return { ok: true };
  },
});

/**
 * A participant's calendar: every task they have claimed, as a subscribable .ics feed. Tasks
 * from superseded plans, or released, stay in the feed as CANCELLED so calendars remove them.
 */
export async function calendarFeed(ctx: Pick<ToolContext, "db" | "appUrl" | "now">, token: string, only?: string) {
  const [me] = await ctx.db.select().from(participants).where(eq(participants.calendarToken, token));
  if (!me) return null;
  const [space] = await ctx.db.select().from(spaces).where(eq(spaces.id, me.spaceId));
  const template = getTemplate(space.templateId);
  const rows = await ctx.db
    .select({ c: commitments, e: events, plan: plans })
    .from(commitments)
    .innerJoin(events, eq(events.id, commitments.eventId))
    .innerJoin(plans, eq(plans.id, events.planId))
    .where(and(eq(commitments.participantId, me.id), only ? eq(commitments.id, only) : undefined));
  const icsEvents: IcsEvent[] = rows.map(({ c, e, plan }) => ({
    uid: `${c.id}@bridging-agent`,
    sequence: c.sequence + (plan.current ? 0 : 1),
    start: e.startsAt,
    durationMinutes: e.durationMinutes,
    summary: `Bring the ${c.part.toLowerCase()}: ${e.title}`,
    description: [
      `You're bringing the ${c.part.toLowerCase()} for "${space.name}".`,
      e.theme ? `Theme: ${e.theme}.` : "",
      plan.constraints.length ? `Every dish must respect: ${plan.constraints.join("; ")}.` : "",
      `See the whole plan: ${ctx.appUrl}/s/${space.id}/plan`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: e.location,
    url: `${ctx.appUrl}/s/${space.id}/plan`,
    cancelled: !plan.current,
    alarmMinutes: template.sustain.cadence === "per_event" ? 180 : undefined,
  }));
  return buildCalendar(`${space.name} (${me.displayName})`, icsEvents, ctx.now);
}
