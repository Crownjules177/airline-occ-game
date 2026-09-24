import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/engine/db/client";
import { createAgentService, type AgentService } from "@/engine/agent/service";
import { accountForSession } from "@/engine/auth";
import { callTool } from "@/engine/tools";
import type { ToolContext } from "@/engine/context";

export const SESSION_COOKIE = "ba_session";

const g = globalThis as unknown as { __bridgingAgent?: AgentService };

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function getCtx(): Promise<ToolContext> {
  // Read cookies first: it marks the route as dynamic before any database work.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  g.__bridgingAgent ??= createAgentService(db);
  return { db, agent: g.__bridgingAgent, accountId: await accountForSession(db, token), now: new Date(), appUrl: appUrl() };
}

/** Call an engine tool from a server component, as the signed-in account. */
export async function call<T = any>(name: string, input: unknown = {}): Promise<T> {
  return (await callTool(await getCtx(), name, input)) as T;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 90 * 24 * 3600,
};
