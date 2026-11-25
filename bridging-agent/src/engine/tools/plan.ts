import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { defineTool } from "./define";
import { actorType, audit, requireHost, requireMember, ToolError, type Member, type ToolContext } from "../context";
import {
  commitments,
  eventAttendance,
  events,
  participants,
  plans,
  profiles,
  proposals,
  spaces,
  type Event,
  type Participant,
} from "../db/schema";
import { suggestAssignments } from "../assign";
import { canSee } from "../visibility";
import { buildCalendar, type IcsEvent } from "../ics";
import { getTemplate } from "../template";
import { loadGroup } from "../group";
import { answerFor, headcount, isAwayFor, loadRoster, suggestDates } from "../attendance";
import { addDays as addDaysIso, localToday, parseDate, zonedTime } from "../schedule";
import { valuesOf } from "../values";
import { whatsappShareUrl } from "../notify";
import { newId } from "../ids";

/** Upcoming dates with unclaimed parts this close are flagged. */
const OPEN_PARTS_WARNING_DAYS = 14;

const localDateFmt = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
const localTimeFmt = (tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const friendly = (tz: string, d: Date) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);

/** Everything needed to judge who can come to each date of the current plan. */
async function planState(ctx: ToolContext, m: Member) {
  const plan = await currentPlan(ctx, m.space.id);
  const evs = plan ? await ctx.db.select().from(events).where(eq(events.planId, plan.id)).orderBy(asc(events.startsAt)) : [];
  const cs = evs.length ? await ctx.db.select().from(commitments).where(inArray(commitments.eventId, evs.map((e) => e.id))) : [];
  const group = await loadGroup(ctx.db, m.space.id, m.template);
  const roster = await loadRoster(ctx.db, m.space.id, evs.map((e) => e.id), group.unavailable);
  const key = m.template.proposal.availabilityField;
  const nights = new Map(group.approved.map((p) => [p.participantId, key ? valuesOf(p.fields[key]?.value ?? null) : []]));
  const tz = m.space.settings.timezone;
  return { plan, evs, cs, group, roster, nights, tz, dateOf: (e: Event) => localDateFmt(tz).format(e.startsAt) };
}

async function loadEvent(ctx: ToolContext, spaceId: string, eventId: string) {
  const [row] = await ctx.db
    .select({ e: events, plan: plans })
    .from(events)
    .innerJoin(plans, eq(plans.id, events.planId))
    .where(and(eq(events.id, eventId), eq(events.spaceId, spaceId)));
  if (!row) throw new ToolError("That date isn't in the plan.", 404);
  if (!row.plan.current) throw new ToolError("That date belongs to an older plan.", 409);
  return row.e;
}

/** Bump every part's sequence on an event so subscribed calendars pick up the change. */
async function touchEvent(ctx: ToolContext, eventId: string) {
  await ctx.db
    .update(commitments)
    .set({ sequence: sql`${commitments.sequence} + 1` })
    .where(eq(commitments.eventId, eventId));
}

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
    const m = await requireMember(ctx, spaceId);
    const { me, template, space, isHost } = m;
    const feedUrl = `${ctx.appUrl}/api/cal/${me.calendarToken}`;
    const { plan, evs, cs, roster, dateOf } = await planState(ctx, m);
    if (!plan) return { plan: null, events: [], feedUrl };
    const today = localToday(ctx.now, space.settings.timezone);
    const people = await ctx.db.select().from(participants).where(eq(participants.spaceId, spaceId));
    const profs = await ctx.db.select().from(profiles).where(eq(profiles.spaceId, spaceId));
    const [proposal] = await ctx.db.select({ parts: proposals.parts }).from(proposals).where(eq(proposals.id, plan.proposalId));
    const order = (part: string) => proposal.parts.indexOf(part);
    const suggestions = suggestAssignments({
      template,
      timezone: space.settings.timezone,
      events: evs.filter((e) => e.status === "scheduled"),
      commitments: cs,
      participants: people,
      profiles: profs,
      awayFor: (eventId, date, participantId) => isAwayFor(roster, eventId, date, participantId),
    });
    const viewer = { participantId: me.id, isHost };
    const name = (id: string | null) => people.find((p) => p.id === id)?.displayName ?? null;
    return {
      plan,
      feedUrl,
      timezone: space.settings.timezone,
      taskNoun: template.act.taskNoun,
      eventNoun: template.act.eventNoun,
      isHost,
      events: evs.map((e) => {
        const date = dateOf(e);
        // Counts only: nobody sees who can't come, not even the host.
        const count = headcount(roster, e.id, date);
        const openParts = cs.filter((c) => c.eventId === e.id && c.status === "open").length;
        const upcoming = date >= today;
        const soon = upcoming && date <= addDaysIso(today, OPEN_PARTS_WARNING_DAYS);
        const attention =
          e.status === "scheduled" && upcoming
            ? [
                ...(count.low ? [`Only ${count.coming} of ${count.total} can come`] : []),
                ...(soon && openParts ? [`${openParts} part${openParts === 1 ? "" : "s"} still open`] : []),
              ]
            : [];
        return {
        ...e,
        date,
        upcoming,
        coming: count.coming,
        households: count.total,
        away: count.away,
        attention,
        myAnswer: answerFor(roster, e.id, me.id),
        meAway: isAwayFor(roster, e.id, date, me.id),
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
        };
      }),
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
    cancelled: !plan.current || e.status === "skipped",
    alarmMinutes: template.sustain.cadence === "per_event" ? 180 : undefined,
  }));
  return buildCalendar(`${space.name} (${me.displayName})`, icsEvents, ctx.now);
}

export const setMyAttendance = defineTool({
  name: "set_my_attendance",
  description:
    "Say whether the caller's household can make one date of the plan: 'away' (can't make it), 'coming' (overrides away dates on their profile), or 'clear'. Saying 'away' gives back any parts they claimed for that date and returns a WhatsApp message asking for cover. Others only ever see counts.",
  layer: "personal",
  input: z.object({ spaceId: z.string(), eventId: z.string(), status: z.enum(["away", "coming", "clear"]) }),
  run: async (ctx, { spaceId, eventId, status }) => {
    const m = await requireMember(ctx, spaceId);
    const e = await loadEvent(ctx, spaceId, eventId);
    await ctx.db.delete(eventAttendance).where(and(eq(eventAttendance.eventId, e.id), eq(eventAttendance.participantId, m.me.id)));
    if (status !== "clear") {
      await ctx.db.insert(eventAttendance).values({ id: newId(), spaceId, eventId: e.id, participantId: m.me.id, status, updatedAt: ctx.now });
    }
    let released: string[] = [];
    if (status === "away") {
      const rows = await ctx.db
        .update(commitments)
        .set({ participantId: null, status: "open", claimedAt: null, sequence: sql`${commitments.sequence} + 1` })
        .where(and(eq(commitments.eventId, e.id), eq(commitments.participantId, m.me.id), eq(commitments.status, "claimed")))
        .returning();
      released = rows.map((r) => r.part);
    }
    await audit(ctx, { spaceId, actorType: actorType(m), actorId: m.me.id, action: `attendance.${status}`, detail: { eventId, released } });
    const when = friendly(m.space.settings.timezone, e.startsAt);
    const parts = released.map((p) => p.toLowerCase()).join(" and ");
    return {
      released,
      whatsapp: released.length
        ? whatsappShareUrl(`We can't make the ${m.template.act.eventNoun} on ${when} after all. Could someone take the ${parts}? ${ctx.appUrl}/s/${spaceId}/plan`)
        : null,
    };
  },
});

export const suggestEventDates = defineTool({
  name: "suggest_event_dates",
  description:
    "Host: suggest up to three nearby dates for one date of the plan, ranked by how many households are free (from their away dates and the nights that suit them). Counts only.",
  layer: "host",
  input: z.object({ spaceId: z.string(), eventId: z.string() }),
  run: async (ctx, { spaceId, eventId }) => {
    const m = await requireHost(ctx, spaceId);
    const e = await loadEvent(ctx, spaceId, eventId);
    const st = await planState(ctx, m);
    const date = st.dateOf(e);
    const claimedBy = st.cs.filter((c) => c.eventId === e.id && c.participantId && c.status !== "open").map((c) => c.participantId!);
    return {
      current: { date, ...headcount(st.roster, e.id, date) },
      time: localTimeFmt(st.tz).format(e.startsAt),
      options: suggestDates({
        roster: st.roster,
        date,
        today: localToday(ctx.now, st.tz),
        takenDates: st.evs.filter((x) => x.id !== e.id && x.status === "scheduled").map(st.dateOf),
        claimedBy,
        availability: st.nights,
      }),
    };
  },
});

export const moveEvent = defineTool({
  name: "move_event",
  description:
    "Host: move one date of the plan to another day (and optionally time). Claimed parts move with it unless that household is away on the new day; answers about the old day are cleared; calendars update. Returns a WhatsApp message for the group.",
  layer: "host",
  input: z.object({
    spaceId: z.string(),
    eventId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").optional(),
  }),
  run: async (ctx, { spaceId, eventId, date, time }) => {
    const m = await requireHost(ctx, spaceId);
    const e = await loadEvent(ctx, spaceId, eventId);
    const tz = m.space.settings.timezone;
    if (!parseDate(date)) throw new ToolError("That isn't a real date.");
    if (date < localToday(ctx.now, tz)) throw new ToolError("Pick a date from today on.");
    const startsAt = zonedTime(date, time ?? localTimeFmt(tz).format(e.startsAt), tz);
    if (startsAt.getTime() === e.startsAt.getTime()) throw new ToolError("That's when it already is.");
    const before = e.startsAt;
    await ctx.db
      .update(events)
      .set({ startsAt, status: "scheduled", movedFrom: e.movedFrom ?? e.startsAt })
      .where(eq(events.id, e.id));
    // Answers were about the old day.
    await ctx.db.delete(eventAttendance).where(eq(eventAttendance.eventId, e.id));
    // Parts stay with their household unless their profile says they're away on the new day.
    const st = await planState(ctx, m);
    const freed: string[] = [];
    for (const c of st.cs.filter((c) => c.eventId === e.id && c.status === "claimed" && c.participantId)) {
      if (isAwayFor(st.roster, null, date, c.participantId!)) {
        await ctx.db.update(commitments).set({ participantId: null, status: "open", claimedAt: null }).where(eq(commitments.id, c.id));
        freed.push(c.part);
      }
    }
    await touchEvent(ctx, e.id);
    await audit(ctx, { spaceId, actorType: "host", actorId: m.me.id, action: "event.moved", detail: { eventId, from: before.toISOString(), to: startsAt.toISOString(), freed } });
    const open = (await ctx.db.select().from(commitments).where(and(eq(commitments.eventId, e.id), eq(commitments.status, "open")))).map((c) => c.part.toLowerCase());
    const label = e.theme ? `${e.theme} ${m.template.act.eventNoun}` : m.template.act.eventNoun;
    const text = [
      `Change of date: our ${label} on ${friendly(tz, before)} is moving to ${friendly(tz, startsAt)}.`,
      open.length ? `Still needed: ${open.join(", ")}.` : "",
      `Can't make the new date? Tap "can't make it" on the plan: ${ctx.appUrl}/s/${spaceId}/plan`,
    ]
      .filter(Boolean)
      .join(" ");
    return { startsAt, freed, whatsapp: whatsappShareUrl(text) };
  },
});

export const skipEvent = defineTool({
  name: "skip_event",
  description:
    "Host: skip one date of the plan (or put a skipped date back). Claimed parts are kept so putting it back restores them; calendars show it as cancelled meanwhile.",
  layer: "host",
  input: z.object({ spaceId: z.string(), eventId: z.string(), skip: z.boolean() }),
  run: async (ctx, { spaceId, eventId, skip }) => {
    const m = await requireHost(ctx, spaceId);
    const e = await loadEvent(ctx, spaceId, eventId);
    await ctx.db.update(events).set({ status: skip ? "skipped" : "scheduled" }).where(eq(events.id, e.id));
    await touchEvent(ctx, e.id);
    await audit(ctx, { spaceId, actorType: "host", actorId: m.me.id, action: skip ? "event.skipped" : "event.restored", detail: { eventId } });
    const when = friendly(m.space.settings.timezone, e.startsAt);
    const noun = m.template.act.eventNoun;
    return {
      whatsapp: whatsappShareUrl(
        skip
          ? `We're skipping the ${noun} on ${when}; the rest of the plan stays the same. ${ctx.appUrl}/s/${spaceId}/plan`
          : `Good news: the ${noun} on ${when} is back on. ${ctx.appUrl}/s/${spaceId}/plan`,
      ),
    };
  },
});
