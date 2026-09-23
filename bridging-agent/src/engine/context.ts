import { and, eq } from "drizzle-orm";
import type { DB } from "./db/client";
import { auditEvents, participants, spaces, type Participant, type Space } from "./db/schema";
import type { AgentService } from "./agent/service";
import { getTemplate, type Template } from "./template";
import { newId } from "./ids";

/** Everything a tool needs. The web app builds one per request; an MCP server would do the same. */
export type ToolContext = {
  db: DB;
  agent: AgentService;
  /** The signed-in account, or null for anonymous calls (only a few tools allow that). */
  accountId: string | null;
  now: Date;
  appUrl: string;
};

export class ToolError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export function requireAccount(ctx: ToolContext): string {
  if (!ctx.accountId) throw new ToolError("Please sign in first.", 401);
  return ctx.accountId;
}

export type Member = { space: Space; me: Participant; template: Template; isHost: boolean };

/** Resolve the caller's membership of a space. Every space-scoped tool starts here. */
export async function requireMember(ctx: ToolContext, spaceId: string): Promise<Member> {
  const accountId = requireAccount(ctx);
  const [row] = await ctx.db
    .select({ space: spaces, me: participants })
    .from(participants)
    .innerJoin(spaces, eq(spaces.id, participants.spaceId))
    .where(and(eq(participants.spaceId, spaceId), eq(participants.accountId, accountId)));
  if (!row) throw new ToolError("You're not a member of this space.", 403);
  return { ...row, template: getTemplate(row.space.templateId), isHost: row.me.role === "host" };
}

export async function requireHost(ctx: ToolContext, spaceId: string): Promise<Member> {
  const m = await requireMember(ctx, spaceId);
  if (!m.isHost) throw new ToolError("Only the host can do that.", 403);
  return m;
}

export async function audit(
  ctx: ToolContext,
  entry: {
    spaceId: string | null;
    actorType: "agent" | "participant" | "host" | "system";
    actorId?: string | null;
    action: string;
    detail?: Record<string, unknown>;
  },
) {
  await ctx.db.insert(auditEvents).values({
    id: newId(),
    spaceId: entry.spaceId,
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    detail: entry.detail ?? {},
  });
}

export const actorType = (m: Member) => (m.isHost ? "host" : "participant") as "host" | "participant";
