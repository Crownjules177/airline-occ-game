/**
 * Seed a demo meal-share space: five households who have finished intake and approved their
 * profiles, ready for the host to draw the map. Uses the mock agent, so it costs nothing.
 *
 *   npm run seed
 *
 * Prints a personal sign-in link for each household so you can try the app as any of them.
 */
import { getDb } from "../src/engine/db/client";
import { AgentService, MockModel } from "../src/engine/agent/service";
import { callTool } from "../src/engine/tools";
import { rotatePersonalLink } from "../src/engine/auth";
import { answers } from "./demo-households";

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const db = await getDb();
const agent = new AgentService(db, new MockModel());
const as = (accountId: string | null) => (name: string, input: unknown = {}) =>
  callTool({ db, agent, accountId, now: new Date(), appUrl }, name, input) as Promise<any>;

const [hostName, ...others] = Object.keys(answers);
const host = await as(null)("create_space", {
  name: "Building meal share (demo)",
  templateId: "community-meals",
  displayName: `The ${hostName}s`,
  consent: true,
});
const { inviteUrl } = await as(host.accountId)("get_space", { spaceId: host.spaceId });
const inviteCode = inviteUrl.split("/join/")[1];
const accounts: [string, string][] = [[hostName, host.accountId]];
for (const name of others) {
  const j = await as(null)("join_space", { inviteCode, displayName: `The ${name}s`, consent: true });
  accounts.push([name, j.accountId]);
}
for (const [name, accountId] of accounts) {
  const call = as(accountId);
  await call("get_intake", { spaceId: host.spaceId });
  for (const text of answers[name]) await call("send_intake_message", { spaceId: host.spaceId, text });
  await call("draft_my_profile", { spaceId: host.spaceId });
  await call("update_my_profile", { spaceId: host.spaceId, approve: true });
}

console.log(`\nSeeded "${"Building meal share (demo)"}" with ${accounts.length} households.\n`);
console.log(`Invite link: ${inviteUrl}\n`);
for (const [name, accountId] of accounts) {
  const link = await rotatePersonalLink(db, accountId, appUrl);
  console.log(`${name === hostName ? "Host  " : "      "} The ${name}s: ${link}`);
}
console.log("\nOpen the host link, go to Map, and draw the group map.");
process.exit(0);
