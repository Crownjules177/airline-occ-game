import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { defineTool } from "./define";
import { audit, requireAccount, requireMember, ToolError } from "../context";
import {
  accounts,
  commitments,
  contributions,
  intakeSessions,
  participants,
  profileRevisions,
  profiles,
  proposalResponses,
} from "../db/schema";

export const exportMyData = defineTool({
  name: "export_my_data",
  description: "Export everything stored about the caller in a space, as JSON (NFR4).",
  layer: "personal",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const { me, space } = await requireMember(ctx, spaceId);
    const [account] = await ctx.db.select().from(accounts).where(eq(accounts.id, me.accountId));
    const [profile] = await ctx.db.select().from(profiles).where(eq(profiles.participantId, me.id));
    return {
      exportedAt: ctx.now.toISOString(),
      space: { id: space.id, name: space.name, templateId: space.templateId },
      account: { name: account.name, email: account.email, createdAt: account.createdAt },
      participant: { ...me, calendarToken: undefined },
      intake: (await ctx.db.select().from(intakeSessions).where(eq(intakeSessions.participantId, me.id)))[0] ?? null,
      profile: profile ?? null,
      profileHistory: profile ? await ctx.db.select().from(profileRevisions).where(eq(profileRevisions.profileId, profile.id)) : [],
      contributions: await ctx.db.select().from(contributions).where(eq(contributions.participantId, me.id)),
      proposalResponses: await ctx.db.select().from(proposalResponses).where(eq(proposalResponses.participantId, me.id)),
      commitments: await ctx.db.select().from(commitments).where(eq(commitments.participantId, me.id)),
    };
  },
});

export const deleteMyData = defineTool({
  name: "delete_my_data",
  description:
    "Leave a space and delete everything the caller contributed to it: intake, profile and history, contributions, responses. Claimed tasks are reopened. Deletes the account too if it has no other spaces.",
  layer: "personal",
  input: z.object({ spaceId: z.string(), confirm: z.literal(true) }),
  run: async (ctx, { spaceId }) => {
    const accountId = requireAccount(ctx);
    const { me, isHost } = await requireMember(ctx, spaceId);
    if (isHost) throw new ToolError("Hosts can't leave their own space yet. Ask another member to take over first.", 409);
    await ctx.db
      .update(commitments)
      .set({ participantId: null, status: "open", claimedAt: null })
      .where(and(eq(commitments.participantId, me.id), inArray(commitments.status, ["claimed"])));
    // Cascades remove intake, profile, revisions, contributions and responses.
    await ctx.db.delete(participants).where(eq(participants.id, me.id));
    await audit(ctx, { spaceId, actorType: "system", action: "participant.deleted_own_data" });
    const remaining = await ctx.db.select({ id: participants.id }).from(participants).where(eq(participants.accountId, accountId));
    if (!remaining.length) await ctx.db.delete(accounts).where(eq(accounts.id, accountId));
    return { accountDeleted: !remaining.length };
  },
});
