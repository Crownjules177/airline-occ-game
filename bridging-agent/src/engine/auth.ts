import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { DB } from "./db/client";
import { accounts, loginTokens, sessions } from "./db/schema";
import { hashToken, newId, newToken } from "./ids";
import { sendEmail } from "./notify";

/**
 * Magic-link login (NFR2). No passwords, no app install.
 *  - email links: single use, 15 minutes, sent through the notifier.
 *  - personal links: the participant's own reusable link, shared to themselves (e.g. on WhatsApp),
 *    rotatable at any time. Hosts can never issue links for other people.
 */

const EMAIL_TTL_MS = 15 * 60_000;
const PERSONAL_TTL_MS = 180 * 24 * 3600_000;
const SESSION_TTL_MS = 90 * 24 * 3600_000;

export async function createAccount(db: DB, name: string, email?: string | null) {
  const id = newId();
  await db.insert(accounts).values({ id, name, email: email?.trim().toLowerCase() || null });
  return id;
}

export async function findAccountByEmail(db: DB, email: string) {
  const [a] = await db.select().from(accounts).where(eq(accounts.email, email.trim().toLowerCase()));
  return a;
}

export async function createSession(db: DB, accountId: string, now = new Date()) {
  const token = newToken(32);
  await db.insert(sessions).values({
    idHash: hashToken(token),
    accountId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

export async function accountForSession(db: DB, token: string | undefined, now = new Date()) {
  if (!token) return null;
  const [s] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.idHash, hashToken(token)), gt(sessions.expiresAt, now)));
  return s?.accountId ?? null;
}

export async function endSession(db: DB, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.idHash, hashToken(token)));
}

export async function requestEmailLink(
  db: DB,
  opts: { email: string; appUrl: string; redirectTo?: string; now?: Date },
): Promise<{ devLink?: string; emailEnabled: boolean }> {
  const emailEnabled = !!process.env.RESEND_API_KEY;
  const account = await findAccountByEmail(db, opts.email);
  if (!account) return { emailEnabled }; // Same response either way, so emails can't be probed.
  const token = newToken();
  const now = opts.now ?? new Date();
  await db.insert(loginTokens).values({
    tokenHash: hashToken(token),
    accountId: account.id,
    kind: "email",
    redirectTo: safeRedirect(opts.redirectTo),
    expiresAt: new Date(now.getTime() + EMAIL_TTL_MS),
  });
  const link = `${opts.appUrl}/auth/${token}`;
  const { delivered } = await sendEmail({
    to: account.email!,
    subject: "Your sign-in link",
    text: `Hi ${account.name},\n\nTap to sign in (valid for 15 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.`,
  });
  return delivered || process.env.NODE_ENV === "production" ? { emailEnabled } : { emailEnabled, devLink: link };
}

/** Create (or rotate) the caller's personal sign-in link. Older personal links stop working. */
export async function rotatePersonalLink(db: DB, accountId: string, appUrl: string, now = new Date()) {
  await db.delete(loginTokens).where(and(eq(loginTokens.accountId, accountId), eq(loginTokens.kind, "personal")));
  const token = newToken();
  await db.insert(loginTokens).values({
    tokenHash: hashToken(token),
    accountId,
    kind: "personal",
    expiresAt: new Date(now.getTime() + PERSONAL_TTL_MS),
  });
  return `${appUrl}/auth/${token}`;
}

/** Exchange a link token for a session. Email tokens are single use; personal ones are reusable. */
export async function consumeLinkToken(db: DB, token: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.tokenHash, hashToken(token)),
        gt(loginTokens.expiresAt, now),
        or(eq(loginTokens.kind, "personal"), isNull(loginTokens.usedAt)),
      ),
    );
  if (!row) return null;
  if (row.kind === "email") {
    await db.update(loginTokens).set({ usedAt: now }).where(eq(loginTokens.tokenHash, row.tokenHash));
  }
  return { sessionToken: await createSession(db, row.accountId, now), redirectTo: row.redirectTo ?? "/" };
}

function safeRedirect(path: string | undefined) {
  return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
}
