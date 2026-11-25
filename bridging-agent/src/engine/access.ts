import { and, eq, gt, lt } from "drizzle-orm";
import type { DB } from "./db/client";
import { accessRequests, participants, spaces } from "./db/schema";
import { hashToken, newId, newToken } from "./ids";
import { createSession } from "./auth";
import { ToolError } from "./context";

/**
 * Getting back in without an email: the household picks itself on the invite page, the host
 * approves, and the device that asked is signed in. The secret stays on that device (an httpOnly
 * cookie), so approving never hands the host anything they could sign in with.
 */

const REQUEST_TTL_MS = 24 * 3600_000;
const APPROVAL_TTL_MS = 2 * 3600_000;
const MAX_PENDING_PER_SPACE = 10;

export async function requestAccess(db: DB, opts: { inviteCode: string; participantId: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const [space] = await db.select().from(spaces).where(eq(spaces.inviteCode, opts.inviteCode));
  if (!space) throw new ToolError("This invite link isn't valid.", 404);
  const [p] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, opts.participantId), eq(participants.spaceId, space.id)));
  if (!p) throw new ToolError("That household isn't in this group.", 404);

  // Expire stale requests; a household has at most one waiting at a time.
  await db
    .update(accessRequests)
    .set({ status: "expired" })
    .where(
      and(
        eq(accessRequests.status, "pending"),
        eq(accessRequests.participantId, p.id),
      ),
    );
  await db
    .update(accessRequests)
    .set({ status: "expired" })
    .where(and(eq(accessRequests.spaceId, space.id), eq(accessRequests.status, "pending"), lt(accessRequests.createdAt, new Date(now.getTime() - REQUEST_TTL_MS))));
  const pending = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.spaceId, space.id), eq(accessRequests.status, "pending")));
  if (pending.length >= MAX_PENDING_PER_SPACE) throw new ToolError("There are already lots of requests waiting. Please ask your host directly.", 409);

  const token = newToken(32);
  await db.insert(accessRequests).values({ id: newId(), spaceId: space.id, participantId: p.id, tokenHash: hashToken(token), createdAt: now });
  return { token, spaceId: space.id, householdName: p.displayName };
}

/** What the waiting device sees. On an approved request it gets a session, once. */
export async function accessStatus(db: DB, token: string | undefined, now = new Date()) {
  if (!token) return { status: "none" as const };
  const [r] = await db.select().from(accessRequests).where(eq(accessRequests.tokenHash, hashToken(token)));
  if (!r) return { status: "none" as const };
  if (r.status === "pending" && r.createdAt.getTime() < now.getTime() - REQUEST_TTL_MS) {
    await db.update(accessRequests).set({ status: "expired" }).where(eq(accessRequests.id, r.id));
    return { status: "expired" as const };
  }
  if (r.status === "approved") {
    if (!r.decidedAt || r.decidedAt.getTime() < now.getTime() - APPROVAL_TTL_MS) return { status: "expired" as const };
    // Mark used first, conditionally, so the approval can only ever be spent once.
    const used = await db
      .update(accessRequests)
      .set({ status: "used", usedAt: now })
      .where(and(eq(accessRequests.id, r.id), eq(accessRequests.status, "approved")))
      .returning();
    if (!used.length) return { status: "used" as const };
    const [p] = await db.select().from(participants).where(eq(participants.id, r.participantId));
    return { status: "approved" as const, sessionToken: await createSession(db, p.accountId, now), spaceId: r.spaceId };
  }
  return { status: r.status };
}

/** Requests still waiting on the host, newest first. */
export async function pendingRequests(db: DB, spaceId: string, now = new Date()) {
  return db
    .select({ id: accessRequests.id, participantId: accessRequests.participantId, householdName: participants.displayName, createdAt: accessRequests.createdAt })
    .from(accessRequests)
    .innerJoin(participants, eq(participants.id, accessRequests.participantId))
    .where(
      and(
        eq(accessRequests.spaceId, spaceId),
        eq(accessRequests.status, "pending"),
        gt(accessRequests.createdAt, new Date(now.getTime() - REQUEST_TTL_MS)),
      ),
    );
}

/** Devices the host let into this household recently, so the household can see it happened. */
export async function recentApprovals(db: DB, participantId: string, now = new Date()) {
  return db
    .select({ usedAt: accessRequests.usedAt })
    .from(accessRequests)
    .where(
      and(
        eq(accessRequests.participantId, participantId),
        eq(accessRequests.status, "used"),
        gt(accessRequests.usedAt, new Date(now.getTime() - 30 * 24 * 3600_000)),
      ),
    );
}
