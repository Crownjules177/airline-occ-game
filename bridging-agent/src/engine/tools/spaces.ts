import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { defineTool } from "./define";
import { audit, requireAccount, requireHost, requireMember, ToolError, type ToolContext } from "../context";
import {
  agentCalls,
  auditEvents,
  intakeSessions,
  participants,
  profiles,
  proposalResponses,
  proposals,
  spaces,
  type SpaceStage,
} from "../db/schema";
import { getTemplate, listTemplates } from "../template";
import { newId, newToken } from "../ids";
import { createAccount, findAccountByEmail, rotatePersonalLink } from "../auth";
import { whatsappShareUrl } from "../notify";

const displayName = z.string().trim().min(1).max(80);
const email = z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined));

async function ensureAccount(ctx: ToolContext, name: string, emailAddr?: string) {
  if (ctx.accountId) return { accountId: ctx.accountId, newAccount: false };
  if (emailAddr && (await findAccountByEmail(ctx.db, emailAddr))) {
    throw new ToolError("That email already has an account. Sign in first, then use the link again.", 409);
  }
  return { accountId: await createAccount(ctx.db, name, emailAddr), newAccount: true };
}

async function addParticipant(
  ctx: ToolContext,
  spaceId: string,
  accountId: string,
  role: "host" | "participant",
  name: string,
  unit: "household" | "individual",
) {
  const id = newId();
  await ctx.db.insert(participants).values({
    id,
    spaceId,
    accountId,
    role,
    unit,
    displayName: name,
    consent: { dataUse: true, agreedAt: ctx.now.toISOString() },
    calendarToken: newToken(),
  });
  return id;
}

export const listTemplatesTool = defineTool({
  name: "list_templates",
  description: "List the available space templates.",
  layer: "group",
  anonymous: true,
  input: z.object({}),
  run: async () =>
    listTemplates().map((t) => ({ id: t.id, name: t.name, status: t.status, description: t.description })),
});

export const createSpace = defineTool({
  name: "create_space",
  description:
    "Create a new space from a template. The caller becomes its host and a participant. Creates an account if the caller is not signed in.",
  layer: "host",
  anonymous: true,
  input: z.object({
    name: z.string().trim().min(1).max(120),
    templateId: z.string(),
    displayName,
    yourName: z.string().trim().min(1).max(80).optional(),
    email,
    consent: z.literal(true),
  }),
  run: async (ctx, input) => {
    const template = getTemplate(input.templateId);
    const { accountId, newAccount } = await ensureAccount(ctx, input.yourName ?? input.displayName, input.email);
    const spaceId = newId();
    await ctx.db.insert(spaces).values({
      id: spaceId,
      name: input.name,
      templateId: template.id,
      hostAccountId: accountId,
      inviteCode: newToken(9),
      settings: { mapThresholdPercent: template.map.thresholdPercent, timezone: template.timezone, location: template.act.location },
    });
    const participantId = await addParticipant(ctx, spaceId, accountId, "host", input.displayName, template.participantUnit);
    await audit(ctx, { spaceId, actorType: "host", actorId: participantId, action: "space.created", detail: { templateId: template.id } });
    return { spaceId, participantId, accountId, newAccount };
  },
});

export const getInvite = defineTool({
  name: "get_invite",
  description: "Look up a space by invite code, to show who is inviting before joining.",
  layer: "group",
  anonymous: true,
  input: z.object({ inviteCode: z.string() }),
  run: async (ctx, { inviteCode }) => {
    const [space] = await ctx.db.select().from(spaces).where(eq(spaces.inviteCode, inviteCode));
    if (!space) throw new ToolError("This invite link isn't valid.", 404);
    const t = getTemplate(space.templateId);
    const [host] = await ctx.db
      .select({ name: participants.displayName })
      .from(participants)
      .where(and(eq(participants.spaceId, space.id), eq(participants.role, "host")));
    let alreadyMember = false;
    if (ctx.accountId) {
      const [p] = await ctx.db
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.spaceId, space.id), eq(participants.accountId, ctx.accountId)));
      alreadyMember = !!p;
    }
    return {
      spaceId: space.id,
      spaceName: space.name,
      hostName: host?.name ?? "",
      template: { name: t.name, description: t.description, unit: t.unitLabel.singular, participantUnit: t.participantUnit },
      alreadyMember,
    };
  },
});

export const joinSpace = defineTool({
  name: "join_space",
  description: "Join a space with its invite code. Creates an account if the caller is not signed in.",
  layer: "personal",
  anonymous: true,
  input: z.object({ inviteCode: z.string(), displayName, email, consent: z.literal(true) }),
  run: async (ctx, input) => {
    const [space] = await ctx.db.select().from(spaces).where(eq(spaces.inviteCode, input.inviteCode));
    if (!space) throw new ToolError("This invite link isn't valid.", 404);
    const template = getTemplate(space.templateId);
    const { accountId, newAccount } = await ensureAccount(ctx, input.displayName, input.email);
    const [existing] = await ctx.db
      .select()
      .from(participants)
      .where(and(eq(participants.spaceId, space.id), eq(participants.accountId, accountId)));
    if (existing) return { spaceId: space.id, participantId: existing.id, accountId, newAccount };
    const participantId = await addParticipant(ctx, space.id, accountId, "participant", input.displayName, template.participantUnit);
    await audit(ctx, { spaceId: space.id, actorType: "participant", actorId: participantId, action: "participant.joined" });
    return { spaceId: space.id, participantId, accountId, newAccount };
  },
});

export const listMySpaces = defineTool({
  name: "list_my_spaces",
  description: "List the spaces the caller belongs to.",
  layer: "personal",
  input: z.object({}),
  run: async (ctx) => {
    const accountId = requireAccount(ctx);
    const rows = await ctx.db
      .select({ space: spaces, me: participants })
      .from(participants)
      .innerJoin(spaces, eq(spaces.id, participants.spaceId))
      .where(eq(participants.accountId, accountId))
      .orderBy(desc(spaces.createdAt));
    return rows.map(({ space, me }) => ({
      spaceId: space.id,
      name: space.name,
      template: getTemplate(space.templateId).name,
      stage: space.stage,
      role: me.role,
      displayName: me.displayName,
    }));
  },
});

export const getMyPersonalLink = defineTool({
  name: "rotate_my_sign_in_link",
  description:
    "Create a new personal sign-in link for the caller, to keep (for example by sending it to yourself on WhatsApp). Any previous personal link stops working.",
  layer: "personal",
  input: z.object({}),
  run: async (ctx) => {
    const accountId = requireAccount(ctx);
    const url = await rotatePersonalLink(ctx.db, accountId, ctx.appUrl, ctx.now);
    await audit(ctx, { spaceId: null, actorType: "participant", actorId: accountId, action: "account.personal_link_rotated" });
    return { url, whatsapp: whatsappShareUrl(`My sign-in link for our group space (keep it private): ${url}`) };
  },
});

/** Overview for any member: the space, their own progress, and group-level counts. */
export const getSpace = defineTool({
  name: "get_space",
  description: "Get a space overview: stage, template, the caller's own progress and group progress counts.",
  layer: "group",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { space, me, template, isHost } = await requireMember(ctx, spaceId);
    const people = await ctx.db.select().from(participants).where(eq(participants.spaceId, spaceId));
    const profs = await ctx.db.select().from(profiles).where(eq(profiles.spaceId, spaceId));
    const [intake] = await ctx.db.select().from(intakeSessions).where(eq(intakeSessions.participantId, me.id));
    const mine = profs.find((p) => p.participantId === me.id);
    const approved = profs.filter((p) => p.status === "approved").length;
    const [openProposals] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(proposals)
      .where(and(eq(proposals.spaceId, spaceId), eq(proposals.status, "open")));
    const [myResponses] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(proposalResponses)
      .innerJoin(proposals, eq(proposals.id, proposalResponses.proposalId))
      .where(and(eq(proposals.spaceId, spaceId), eq(proposals.status, "open"), eq(proposalResponses.participantId, me.id)));
    return {
      space: { id: space.id, name: space.name, stage: space.stage, settings: space.settings },
      template: {
        id: template.id,
        name: template.name,
        unit: template.unitLabel,
        stages: template.stages,
        eventNoun: template.act.eventNoun,
        taskNoun: template.act.taskNoun,
      },
      me: { participantId: me.id, displayName: me.displayName, role: me.role, isHost },
      progress: {
        intake: intake?.status ?? "not_started",
        profile: mine?.status ?? "none",
        openProposals: openProposals.n,
        respondedProposals: myResponses.n,
      },
      group: {
        participants: people.length,
        approvedProfiles: approved,
        thresholdPercent: space.settings.mapThresholdPercent,
      },
      inviteUrl: isHost ? `${ctx.appUrl}/join/${space.inviteCode}` : undefined,
    };
  },
});

export const hostOverview = defineTool({
  name: "host_overview",
  description: "Host view of every participant's progress (status only, never private answers).",
  layer: "host",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { space, template } = await requireHost(ctx, spaceId);
    const people = await ctx.db.select().from(participants).where(eq(participants.spaceId, spaceId));
    const ids = people.map((p) => p.id);
    const intakes = ids.length
      ? await ctx.db.select().from(intakeSessions).where(inArray(intakeSessions.participantId, ids))
      : [];
    const profs = await ctx.db.select().from(profiles).where(eq(profiles.spaceId, spaceId));
    const inviteUrl = `${ctx.appUrl}/join/${space.inviteCode}`;
    return {
      inviteUrl,
      inviteWhatsapp: whatsappShareUrl(
        `Join our ${template.name.toLowerCase()} "${space.name}". A short chat about what your ${template.unitLabel.singular} likes, then we plan together: ${inviteUrl}`,
      ),
      settings: space.settings,
      stage: space.stage,
      participants: people.map((p) => ({
        participantId: p.id,
        displayName: p.displayName,
        role: p.role,
        joinedAt: p.createdAt,
        intake: intakes.find((i) => i.participantId === p.id)?.status ?? "not_started",
        profile: profs.find((x) => x.participantId === p.id)?.status ?? "none",
      })),
    };
  },
});

export const updateSpaceSettings = defineTool({
  name: "update_space_settings",
  description: "Host: change the space name, map threshold, location, or move the space to a stage.",
  layer: "host",
  input: z.object({
    spaceId: z.string(),
    name: z.string().trim().min(1).max(120).optional(),
    mapThresholdPercent: z.number().int().min(1).max(100).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    stage: z.enum(["intake", "map", "agree", "act", "sustain"]).optional(),
  }),
  run: async (ctx, input) => {
    const { space, me } = await requireHost(ctx, input.spaceId);
    const settings = {
      ...space.settings,
      ...(input.mapThresholdPercent != null && { mapThresholdPercent: input.mapThresholdPercent }),
      ...(input.location && { location: input.location }),
    };
    await ctx.db
      .update(spaces)
      .set({ settings, ...(input.name && { name: input.name }), ...(input.stage && { stage: input.stage as SpaceStage }) })
      .where(eq(spaces.id, space.id));
    await audit(ctx, { spaceId: space.id, actorType: "host", actorId: me.id, action: "space.settings_updated", detail: input });
    return { ok: true };
  },
});

export const getAuditLog = defineTool({
  name: "get_audit_log",
  description: "Host: every agent call (prompt version, inputs, outputs) and action in the space, newest first.",
  layer: "host",
  input: z.object({ spaceId: z.string(), limit: z.number().int().min(1).max(500).default(100) }),
  run: async (ctx, { spaceId, limit }) => {
    await requireHost(ctx, spaceId);
    const calls = await ctx.db
      .select()
      .from(agentCalls)
      .where(eq(agentCalls.spaceId, spaceId))
      .orderBy(desc(agentCalls.createdAt))
      .limit(limit);
    const events = await ctx.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.spaceId, spaceId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
    return { agentCalls: calls, events };
  },
});

export async function spaceStage(ctx: ToolContext, spaceId: string, stage: SpaceStage) {
  await ctx.db.update(spaces).set({ stage }).where(eq(spaces.id, spaceId));
}

