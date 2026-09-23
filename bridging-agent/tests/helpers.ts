import { createMemoryDb, type DB } from "@/engine/db/client";
import { AgentService, MockModel } from "@/engine/agent/service";
import { callTool } from "@/engine/tools";
import type { ToolContext } from "@/engine/context";
import { answers } from "../scripts/demo-households";

export async function setup() {
  const db = await createMemoryDb();
  const agent = new AgentService(db, new MockModel());
  let now = new Date("2026-09-23T00:00:00Z");
  const ctx = (accountId: string | null): ToolContext => ({ db, agent, accountId, now, appUrl: "https://app.test" });
  const as = (accountId: string | null) => ({
    call: <T = any>(name: string, input: unknown = {}) => callTool(ctx(accountId), name, input) as Promise<T>,
  });
  return { db, agent, ctx, as, setNow: (d: Date) => (now = d) };
}

export type Harness = Awaited<ReturnType<typeof setup>>;

export { answers } from "../scripts/demo-households";

export async function runIntake(h: Harness, accountId: string, spaceId: string, replies: string[]) {
  const u = h.as(accountId);
  await u.call("get_intake", { spaceId });
  for (const text of replies) await u.call("send_intake_message", { spaceId, text });
  await u.call("draft_my_profile", { spaceId });
  return u.call("get_my_profile", { spaceId });
}

/** A space with the Nguyen household as host plus four more households, all through intake and approved. */
export async function mealSpace(h: Harness) {
  const host = await h.as(null).call("create_space", {
    name: "Building meal share",
    templateId: "community-meals",
    displayName: "Nguyen",
    email: "nguyen@example.org",
    consent: true,
  });
  const { inviteUrl } = await h.as(host.accountId).call("get_space", { spaceId: host.spaceId });
  const inviteCode = inviteUrl.split("/join/")[1];
  const accounts: Record<string, string> = { Nguyen: host.accountId };
  for (const name of ["Patel", "Okafor", "Smith", "Haddad"]) {
    const j = await h.as(null).call("join_space", { inviteCode, displayName: name, consent: true });
    accounts[name] = j.accountId;
  }
  for (const [name, acc] of Object.entries(accounts)) {
    await runIntake(h, acc, host.spaceId, answers[name]);
    await h.as(acc).call("update_my_profile", { spaceId: host.spaceId, approve: true });
  }
  return { spaceId: host.spaceId, accounts, inviteCode };
}
