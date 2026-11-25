import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { defineTool } from "./define";
import { audit, requireAccount, requireHost, ToolError } from "../context";
import { accessRequests, accounts } from "../db/schema";
import { findAccountByEmail } from "../auth";

export const emailEnabled = () => !!process.env.RESEND_API_KEY;

export const getMyAccount = defineTool({
  name: "get_my_account",
  description: "The caller's account: name, sign-in email, and whether email sign-in is switched on.",
  layer: "personal",
  input: z.object({}),
  run: async (ctx) => {
    const accountId = requireAccount(ctx);
    const [a] = await ctx.db.select().from(accounts).where(eq(accounts.id, accountId));
    return { name: a.name, email: a.email, emailEnabled: emailEnabled() };
  },
});

export const updateMyEmail = defineTool({
  name: "update_my_email",
  description: "Set or change the caller's sign-in email, so they can always get a sign-in link sent to them.",
  layer: "personal",
  input: z.object({ email: z.string().trim().toLowerCase().email().max(200) }),
  run: async (ctx, { email }) => {
    const accountId = requireAccount(ctx);
    const other = await findAccountByEmail(ctx.db, email);
    if (other && other.id !== accountId) throw new ToolError("That email is already used by another account.", 409);
    await ctx.db.update(accounts).set({ email }).where(eq(accounts.id, accountId));
    await audit(ctx, { spaceId: null, actorType: "participant", actorId: accountId, action: "account.email_updated" });
    return { email };
  },
});

export const decideAccessRequest = defineTool({
  name: "decide_access_request",
  description:
    "Host: let a household back in from the device that asked, or decline. Approving never gives the host a sign-in link; only the waiting device is signed in, and the household is told.",
  layer: "host",
  input: z.object({ spaceId: z.string(), requestId: z.string(), approve: z.boolean() }),
  run: async (ctx, { spaceId, requestId, approve }) => {
    const m = await requireHost(ctx, spaceId);
    const updated = await ctx.db
      .update(accessRequests)
      .set({ status: approve ? "approved" : "declined", decidedBy: m.me.id, decidedAt: ctx.now })
      .where(and(eq(accessRequests.id, requestId), eq(accessRequests.spaceId, spaceId), eq(accessRequests.status, "pending")))
      .returning();
    if (!updated.length) throw new ToolError("That request has already been answered or has expired.", 409);
    await audit(ctx, {
      spaceId,
      actorType: "host",
      actorId: m.me.id,
      action: approve ? "access.approved" : "access.declined",
      detail: { participantId: updated[0].participantId },
    });
    return { ok: true };
  },
});
