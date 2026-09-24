import { z } from "zod";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { defineTool } from "./define";
import { actorType, audit, requireHost, requireMember, ToolError, type Member, type ToolContext } from "../context";
import {
  commitments,
  contributions,
  events,
  maps,
  participants,
  plans,
  proposalResponses,
  proposals,
  type Proposal,
  type Schedule,
} from "../db/schema";
import { proposalsStage, reviseStage, type ProposalContext, type ProposalDraft } from "../agent/stages";
import { leaksPrivate, loadGroup } from "../group";
import { addDays, expandSchedule, localToday, nextWeekday, parseDate, zonedTime } from "../schedule";
import { WEEKDAYS, type Weekday } from "../template";
import { constraintConflicts } from "../values";
import { newId } from "../ids";
import { whatsappShareUrl } from "../notify";
import { spaceStage } from "./spaces";

/** Proposals start at least this many days out, so people can plan. */
const LEAD_DAYS = 7;

async function proposalContext(ctx: ToolContext, m: Member) {
  const group = await loadGroup(ctx.db, m.space.id, m.template);
  const [map] = await ctx.db
    .select()
    .from(maps)
    .where(and(eq(maps.spaceId, m.space.id), eq(maps.current, true)));
  if (!map) throw new ToolError("Generate the group map first.", 409);
  const input: ProposalContext = {
    earliestStart: addDays(localToday(ctx.now, m.space.settings.timezone), LEAD_DAYS),
    timezone: m.space.settings.timezone,
    participantCount: group.people.length,
    map: map.items.map(({ id, kind, title, detail, sourceContributionIds }) => ({ id, kind, title, detail, sourceContributionIds })),
    constraints: group.constraints.labels,
    availability: group.availability,
    sharedContributions: group.shared,
    ideas: group.ideas,
  };
  return { group, map, input };
}

type Ctx = Awaited<ReturnType<typeof proposalContext>>;

/**
 * Validate and repair a drafted option on the server: schedule within template limits, a start
 * date that is real and far enough out, hard constraints attached and never contradicted by a
 * theme, provenance limited to real ids, and nothing that links a name to private data.
 */
export function sanitizeDraft(
  d: ProposalDraft,
  m: Member,
  c: Ctx,
  extraAllowedIds: string[] = [],
): Omit<Proposal, "id" | "spaceId" | "roundId" | "version" | "parentId" | "status" | "hostEdited" | "agentCallId" | "releasedAt" | "createdAt"> | null {
  const t = m.template;
  const notes: string[] = [];
  const weekday: Weekday = WEEKDAYS.includes(d.weekday) ? d.weekday : "Thu";
  const cadence = t.proposal.cadences.includes(d.cadence) ? d.cadence : t.proposal.cadences[0];
  const occurrences = Math.min(Math.max(Math.round(Number(d.occurrences) || 1), 1), t.proposal.maxOccurrences);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time) ? d.time : t.act.defaultTime;
  const start = parseDate(d.startDate) && d.startDate >= c.input.earliestStart ? d.startDate : c.input.earliestStart;
  const schedule: Schedule = { weekday, cadence, startDate: nextWeekday(start, weekday), occurrences, time };

  const themes = d.themes.map((x) => x.trim()).filter(Boolean).slice(0, occurrences);
  const safeThemes = themes.map((theme) => {
    if (constraintConflicts(theme, c.group.constraints.forbidden).length) {
      notes.push(`A suggested theme was replaced because it conflicted with a hard constraint.`);
      return "Cook's choice";
    }
    return theme;
  });
  const parts = [...new Set(d.parts.map((x) => x.trim()).filter(Boolean))].slice(0, 8);

  const texts = [d.title, d.summary];
  if (texts.some((x) => leaksPrivate(x, c.group.privatePairs))) return null;
  const tradeoffs = d.tradeoffs.filter((x) => !leaksPrivate(x, c.group.privatePairs));

  const allowedContribs = new Set([...c.group.shared, ...c.group.ideas].map((x) => x.id).concat(extraAllowedIds));
  const allowedItems = new Set(c.map.items.map((i) => i.id));
  return {
    title: d.title.trim().slice(0, 140),
    summary: d.summary.trim().slice(0, 1000),
    tradeoffs: [...tradeoffs, ...new Set(notes)],
    schedule,
    themes: safeThemes,
    parts: parts.length ? parts : t.proposal.parts,
    constraints: c.group.constraints.labels,
    sourceContributionIds: [...new Set(d.sourceContributionIds.filter((id) => allowedContribs.has(id)))],
    mapItemIds: [...new Set(d.mapItemIds.filter((id) => allowedItems.has(id)))],
  };
}

function asDraft(p: Proposal): ProposalDraft {
  return {
    title: p.title,
    summary: p.summary,
    tradeoffs: p.tradeoffs,
    weekday: p.schedule.weekday as Weekday,
    cadence: p.schedule.cadence,
    startDate: p.schedule.startDate,
    occurrences: p.schedule.occurrences,
    time: p.schedule.time,
    themes: p.themes,
    parts: p.parts,
    sourceContributionIds: p.sourceContributionIds,
    mapItemIds: p.mapItemIds,
  };
}

async function loadProposal(ctx: ToolContext, spaceId: string, proposalId: string) {
  const [p] = await ctx.db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.spaceId, spaceId)));
  if (!p) throw new ToolError("Proposal not found.", 404);
  return p;
}

export const listProposals = defineTool({
  name: "list_proposals",
  description:
    "List proposals with response tallies, objection reasons (credited) and the caller's own response. Participants see released proposals; the host also sees drafts.",
  layer: "group",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { me, isHost, template } = await requireMember(ctx, spaceId);
    const all = await ctx.db.select().from(proposals).where(eq(proposals.spaceId, spaceId)).orderBy(asc(proposals.createdAt));
    // Newest round first; within a round, the agent's order, with revisions after what they revise.
    const latest = new Map<string, number>();
    for (const p of all) latest.set(p.roundId, Math.max(latest.get(p.roundId) ?? 0, p.createdAt.getTime()));
    const rows = [...all].sort((a, b) => latest.get(b.roundId)! - latest.get(a.roundId)! || a.createdAt.getTime() - b.createdAt.getTime());
    const visible = rows.filter((p) => isHost || p.status !== "draft");
    const ids = visible.map((p) => p.id);
    const responses = ids.length
      ? await ctx.db
          .select({ r: proposalResponses, name: participants.displayName })
          .from(proposalResponses)
          .innerJoin(participants, eq(participants.id, proposalResponses.participantId))
          .where(inArray(proposalResponses.proposalId, ids))
      : [];
    const people = await ctx.db.select({ id: participants.id }).from(participants).where(eq(participants.spaceId, spaceId));
    return {
      participantCount: people.length,
      label: template.proposal.label,
      proposals: visible.map((p) => {
        const rs = responses.filter((x) => x.r.proposalId === p.id);
        return {
          ...p,
          tally: {
            support: rs.filter((x) => x.r.signal === "support").length,
            liveWith: rs.filter((x) => x.r.signal === "live_with").length,
            object: rs.filter((x) => x.r.signal === "object").length,
          },
          objections: rs.filter((x) => x.r.signal === "object").map((x) => ({ author: x.name, reason: x.r.reason })),
          mine: rs.find((x) => x.r.participantId === me.id)?.r ?? null,
        };
      }),
    };
  },
});

export const draftProposals = defineTool({
  name: "draft_proposals",
  description:
    "Host: have the agent draft two or three plan options from the current map. Drafts are only visible to the host until released.",
  layer: "host",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const m = await requireHost(ctx, spaceId);
    const c = await proposalContext(ctx, m);
    const { output, callId } = await ctx.agent.run(proposalsStage, { spaceId, template: m.template, input: c.input });
    const roundId = newId();
    const created: string[] = [];
    for (const option of output.options.slice(0, 3)) {
      const clean = sanitizeDraft(option, m, c);
      if (!clean) continue;
      const id = newId();
      await ctx.db.insert(proposals).values({ id, spaceId, roundId, agentCallId: callId, status: "draft", ...clean });
      created.push(id);
    }
    if (!created.length) throw new ToolError("The agent's drafts didn't pass the privacy and constraint checks. Try again.");
    await audit(ctx, { spaceId, actorType: "agent", action: "proposals.drafted", detail: { roundId, proposalIds: created, requestedBy: m.me.id } });
    return { roundId, proposalIds: created };
  },
});

export const editProposal = defineTool({
  name: "edit_proposal",
  description: "Host: edit a draft proposal before release. Hard constraints are re-applied.",
  layer: "host",
  input: z.object({
    spaceId: z.string(),
    proposalId: z.string(),
    title: z.string().trim().min(1).max(140).optional(),
    summary: z.string().trim().min(1).max(1000).optional(),
    tradeoffs: z.array(z.string()).optional(),
    weekday: z.enum(WEEKDAYS).optional(),
    cadence: z.enum(["weekly", "fortnightly", "monthly"]).optional(),
    startDate: z.string().optional(),
    occurrences: z.number().int().optional(),
    time: z.string().optional(),
    themes: z.array(z.string()).optional(),
    parts: z.array(z.string()).optional(),
  }),
  run: async (ctx, input) => {
    const m = await requireHost(ctx, input.spaceId);
    const p = await loadProposal(ctx, input.spaceId, input.proposalId);
    if (p.status !== "draft") throw new ToolError("Only drafts can be edited. Draft a revision instead.", 409);
    const c = await proposalContext(ctx, m);
    const { spaceId: _s, proposalId: _p, ...changes } = input;
    const merged = { ...asDraft(p), ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) } as ProposalDraft;
    const clean = sanitizeDraft(merged, m, c, p.sourceContributionIds);
    if (!clean) throw new ToolError("That edit would link someone's name to their private information.");
    await ctx.db.update(proposals).set({ ...clean, hostEdited: true }).where(eq(proposals.id, p.id));
    await audit(ctx, { spaceId: input.spaceId, actorType: "host", actorId: m.me.id, action: "proposal.edited", detail: { proposalId: p.id } });
    return { ok: true };
  },
});

export const releaseProposal = defineTool({
  name: "release_proposal",
  description: "Host: release a draft to the group for responses. A released revision replaces the version it revises.",
  layer: "host",
  input: z.object({ spaceId: z.string(), proposalId: z.string() }),
  run: async (ctx, { spaceId, proposalId }) => {
    const m = await requireHost(ctx, spaceId);
    const p = await loadProposal(ctx, spaceId, proposalId);
    if (p.status !== "draft") throw new ToolError("Already released.", 409);
    await ctx.db.update(proposals).set({ status: "open", releasedAt: ctx.now }).where(eq(proposals.id, p.id));
    if (p.parentId) await ctx.db.update(proposals).set({ status: "superseded" }).where(eq(proposals.id, p.parentId));
    if (m.space.stage === "intake" || m.space.stage === "map") await spaceStage(ctx, spaceId, "agree");
    await audit(ctx, { spaceId, actorType: "host", actorId: m.me.id, action: "proposal.released", detail: { proposalId } });
    const url = `${ctx.appUrl}/s/${spaceId}/proposals`;
    return {
      whatsapp: whatsappShareUrl(`New ${m.template.proposal.label.toLowerCase()} option to look at: "${p.title}". Support, can live with it, or object: ${url}`),
    };
  },
});

export const respondToProposal = defineTool({
  name: "respond_to_proposal",
  description: "Respond to an open proposal: support, can live with it, or object (with a reason). Can be changed while it is open.",
  layer: "personal",
  input: z.object({
    spaceId: z.string(),
    proposalId: z.string(),
    signal: z.enum(["support", "live_with", "object"]),
    reason: z.string().trim().max(1000).optional(),
  }),
  run: async (ctx, input) => {
    const m = await requireMember(ctx, input.spaceId);
    const p = await loadProposal(ctx, input.spaceId, input.proposalId);
    if (p.status !== "open") throw new ToolError("This proposal isn't open for responses.", 409);
    if (input.signal === "object" && !input.reason) throw new ToolError("Please say why you object, so the agent can revise it.");
    const reason = input.reason || null;
    await ctx.db
      .insert(proposalResponses)
      .values({ id: newId(), proposalId: p.id, participantId: m.me.id, signal: input.signal, reason })
      .onConflictDoUpdate({
        target: [proposalResponses.proposalId, proposalResponses.participantId],
        set: { signal: input.signal, reason, createdAt: ctx.now },
      });
    if (input.signal === "object") {
      await ctx.db.insert(contributions).values({
        id: newId(),
        spaceId: input.spaceId,
        participantId: m.me.id,
        kind: "objection",
        body: reason!,
        refType: "proposal",
        refId: p.id,
        visibility: "group",
      });
    }
    await audit(ctx, { spaceId: input.spaceId, actorType: actorType(m), actorId: m.me.id, action: "proposal.responded", detail: { proposalId: p.id, signal: input.signal } });
    return { ok: true };
  },
});

export const draftRevision = defineTool({
  name: "draft_revision",
  description: "Host: have the agent revise an open proposal to resolve its objections. The revision is a draft until released.",
  layer: "host",
  input: z.object({ spaceId: z.string(), proposalId: z.string() }),
  run: async (ctx, { spaceId, proposalId }) => {
    const m = await requireHost(ctx, spaceId);
    const p = await loadProposal(ctx, spaceId, proposalId);
    if (p.status !== "open") throw new ToolError("Only open proposals can be revised.", 409);
    const responses = await ctx.db.select().from(proposalResponses).where(eq(proposalResponses.proposalId, p.id));
    const objectors = responses.filter((r) => r.signal === "object").map((r) => r.participantId);
    if (!objectors.length) throw new ToolError("There are no objections to resolve.", 409);
    // The current objection from each objector (their latest objection contribution).
    const objectionRows = await ctx.db
      .select({ id: contributions.id, body: contributions.body, participantId: contributions.participantId, author: participants.displayName })
      .from(contributions)
      .innerJoin(participants, eq(participants.id, contributions.participantId))
      .where(and(eq(contributions.kind, "objection"), eq(contributions.refId, p.id), inArray(contributions.participantId, objectors)))
      .orderBy(desc(contributions.createdAt));
    const latest = new Map<string, (typeof objectionRows)[number]>();
    for (const o of objectionRows) if (!latest.has(o.participantId!)) latest.set(o.participantId!, o);
    const objections = [...latest.values()].map((o) => ({ contributionId: o.id, author: o.author, reason: o.body }));

    const c = await proposalContext(ctx, m);
    const { output, callId } = await ctx.agent.run(reviseStage, {
      spaceId,
      template: m.template,
      input: {
        ...c.input,
        proposal: asDraft(p),
        responses: {
          support: responses.filter((r) => r.signal === "support").length,
          liveWith: responses.filter((r) => r.signal === "live_with").length,
        },
        objections,
      },
    });
    const clean = sanitizeDraft(output.option, m, c, [...p.sourceContributionIds, ...objections.map((o) => o.contributionId)]);
    if (!clean) throw new ToolError("The revision didn't pass the privacy checks. Try again.");
    clean.tradeoffs = [output.changeNote, ...clean.tradeoffs.filter((x) => x !== output.changeNote)];
    // A revision always credits the objections it responds to.
    clean.sourceContributionIds = [...new Set([...clean.sourceContributionIds, ...objections.map((o) => o.contributionId)])];
    const id = newId();
    await ctx.db.insert(proposals).values({
      id,
      spaceId,
      roundId: p.roundId,
      version: p.version + 1,
      parentId: p.id,
      agentCallId: callId,
      status: "draft",
      ...clean,
    });
    await audit(ctx, { spaceId, actorType: "agent", action: "proposal.revised", detail: { from: p.id, to: id, objections: objections.length } });
    return { proposalId: id };
  },
});

export const dropProposal = defineTool({
  name: "drop_proposal",
  description: "Host: drop a draft or open proposal.",
  layer: "host",
  input: z.object({ spaceId: z.string(), proposalId: z.string() }),
  run: async (ctx, { spaceId, proposalId }) => {
    const m = await requireHost(ctx, spaceId);
    const p = await loadProposal(ctx, spaceId, proposalId);
    if (!["draft", "open"].includes(p.status)) throw new ToolError("Only drafts and open proposals can be dropped.", 409);
    await ctx.db.update(proposals).set({ status: "dropped" }).where(eq(proposals.id, p.id));
    await audit(ctx, { spaceId, actorType: "host", actorId: m.me.id, action: "proposal.dropped", detail: { proposalId } });
    return { ok: true };
  },
});

export const adoptProposal = defineTool({
  name: "adopt_proposal",
  description:
    "Host: record that the group has agreed an open proposal with no outstanding objections. It becomes the group's plan (versioned) and generates the tasks.",
  layer: "host",
  input: z.object({ spaceId: z.string(), proposalId: z.string() }),
  run: async (ctx, { spaceId, proposalId }) => {
    const m = await requireHost(ctx, spaceId);
    const p = await loadProposal(ctx, spaceId, proposalId);
    if (p.status !== "open") throw new ToolError("Only an open proposal can be agreed.", 409);
    const responses = await ctx.db.select().from(proposalResponses).where(eq(proposalResponses.proposalId, p.id));
    if (responses.some((r) => r.signal === "object")) {
      throw new ToolError("This proposal has objections. Draft a revision rather than overriding them.", 409);
    }
    if (!responses.length) throw new ToolError("Nobody has responded yet.", 409);

    const [prev] = await ctx.db.select().from(plans).where(eq(plans.spaceId, spaceId)).orderBy(desc(plans.version)).limit(1);
    await ctx.db.update(plans).set({ current: false }).where(eq(plans.spaceId, spaceId));
    const planId = newId();
    await ctx.db.insert(plans).values({
      id: planId,
      spaceId,
      version: (prev?.version ?? 0) + 1,
      proposalId: p.id,
      title: p.title,
      summary: p.summary,
      constraints: p.constraints,
    });
    const noun = m.template.act.eventNoun;
    const dates = expandSchedule(p.schedule);
    for (const [i, date] of dates.entries()) {
      const theme = p.themes.length ? p.themes[i % p.themes.length] : null;
      const eventId = newId();
      await ctx.db.insert(events).values({
        id: eventId,
        spaceId,
        planId,
        title: `${noun[0].toUpperCase()}${noun.slice(1)}${theme ? `: ${theme}` : ""}`,
        theme,
        startsAt: zonedTime(date, p.schedule.time, m.space.settings.timezone),
        durationMinutes: m.template.act.durationMinutes,
        location: m.space.settings.location,
      });
      await ctx.db.insert(commitments).values(p.parts.map((part) => ({ id: newId(), spaceId, eventId, part })));
    }
    await ctx.db.update(proposals).set({ status: "agreed" }).where(eq(proposals.id, p.id));
    await ctx.db
      .update(proposals)
      .set({ status: "dropped" })
      .where(and(eq(proposals.spaceId, spaceId), inArray(proposals.status, ["draft", "open"]), ne(proposals.id, p.id)));
    await spaceStage(ctx, spaceId, "act");
    await audit(ctx, { spaceId, actorType: "host", actorId: m.me.id, action: "plan.adopted", detail: { proposalId: p.id, planId, events: dates.length } });
    const url = `${ctx.appUrl}/s/${spaceId}/plan`;
    return {
      planId,
      whatsapp: whatsappShareUrl(`We have a plan: "${p.title}". Claim your part of each ${noun} here: ${url}`),
    };
  },
});
