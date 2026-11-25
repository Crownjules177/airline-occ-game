import { describe, expect, it } from "vitest";
import { setup } from "./helpers";
import { accessStatus, requestAccess } from "@/engine/access";
import { accountForSession, createSession, endOtherSessions, rotatePersonalLink, consumeLinkToken } from "@/engine/auth";

async function smallSpace() {
  const h = await setup();
  const host = await h.as(null).call("create_space", {
    name: "Building meal share",
    templateId: "community-meals",
    displayName: "Nguyen",
    email: "nguyen@example.org",
    consent: true,
  });
  const { inviteUrl } = await h.as(host.accountId).call("get_space", { spaceId: host.spaceId });
  const inviteCode = inviteUrl.split("/join/")[1];
  const patel = await h.as(null).call("join_space", { inviteCode, displayName: "Patel", consent: true });
  const smith = await h.as(null).call("join_space", { inviteCode, displayName: "Smith", consent: true });
  return { h, host, patel, smith, inviteCode, spaceId: host.spaceId as string };
}

describe("getting back in", () => {
  it("lets only the device that asked back in, once, after the host approves", async () => {
    const { h, host, patel, inviteCode, spaceId } = await smallSpace();
    const invite = await h.as(null).call("get_invite", { inviteCode });
    expect(invite.households.map((x: any) => x.name)).toEqual(["Nguyen", "Patel", "Smith"]);
    const patelId = invite.households.find((x: any) => x.name === "Patel").id;

    const T = new Date("2026-09-23T00:00:00Z"); // the harness clock
    const { token } = await requestAccess(h.db, { inviteCode, participantId: patelId, now: T });
    expect(await accessStatus(h.db, token, T)).toEqual({ status: "pending" });

    // The host sees the request (names only) and nobody else can decide it.
    const overview = await h.as(host.accountId).call("host_overview", { spaceId });
    expect(overview.accessRequests).toHaveLength(1);
    expect(overview.accessRequests[0].householdName).toBe("Patel");
    expect(JSON.stringify(overview.accessRequests)).not.toContain(token);
    expect((await h.as(host.accountId).call("get_space", { spaceId })).pendingAccessRequests).toBe(1);
    const requestId = overview.accessRequests[0].id;
    await expect(h.as(patel.accountId).call("decide_access_request", { spaceId, requestId, approve: true })).rejects.toThrow(/host/);

    const decided = await h.as(host.accountId).call("decide_access_request", { spaceId, requestId, approve: true });
    expect(decided).toEqual({ ok: true }); // nothing the host could sign in with

    // A different device (no token, wrong token) gets nothing.
    expect((await accessStatus(h.db, undefined)).status).toBe("none");
    expect((await accessStatus(h.db, "not-the-token")).status).toBe("none");

    const r = await accessStatus(h.db, token, T);
    expect(r.status).toBe("approved");
    if (r.status !== "approved") throw new Error();
    expect(await accountForSession(h.db, r.sessionToken)).toBe(patel.accountId);
    expect(r.spaceId).toBe(spaceId);

    // Single use.
    expect((await accessStatus(h.db, token, T)).status).toBe("used");
    await expect(h.as(host.accountId).call("decide_access_request", { spaceId, requestId, approve: true })).rejects.toThrow(/already/);

    // The household is told a device was let in.
    const me = await h.as(patel.accountId).call("get_space", { spaceId });
    expect(me.me.hostLetInAt).toHaveLength(1);
    expect((await h.as(host.accountId).call("host_overview", { spaceId })).accessRequests).toHaveLength(0);
  });

  it("declines, expires and replaces requests", async () => {
    const { h, host, inviteCode, spaceId } = await smallSpace();
    const invite = await h.as(null).call("get_invite", { inviteCode });
    const smithId = invite.households.find((x: any) => x.name === "Smith").id;
    const t0 = new Date("2026-09-23T00:00:00Z");

    // Declined.
    const a = await requestAccess(h.db, { inviteCode, participantId: smithId, now: t0 });
    const [req] = (await h.as(host.accountId).call("host_overview", { spaceId })).accessRequests;
    await h.as(host.accountId).call("decide_access_request", { spaceId, requestId: req.id, approve: false });
    expect((await accessStatus(h.db, a.token, t0)).status).toBe("declined");

    // Asking again replaces the earlier pending request.
    const b = await requestAccess(h.db, { inviteCode, participantId: smithId, now: t0 });
    const c = await requestAccess(h.db, { inviteCode, participantId: smithId, now: t0 });
    expect((await accessStatus(h.db, b.token, t0)).status).toBe("expired");
    expect((await accessStatus(h.db, c.token, t0)).status).toBe("pending");

    // Pending requests expire after a day.
    expect((await accessStatus(h.db, c.token, new Date(t0.getTime() + 25 * 3600_000))).status).toBe("expired");

    // An approval not picked up within two hours lapses.
    const d = await requestAccess(h.db, { inviteCode, participantId: smithId, now: t0 });
    const [req2] = (await h.as(host.accountId).call("host_overview", { spaceId })).accessRequests;
    h.setNow(t0);
    await h.as(host.accountId).call("decide_access_request", { spaceId, requestId: req2.id, approve: true });
    expect((await accessStatus(h.db, d.token, new Date(t0.getTime() + 3 * 3600_000))).status).toBe("expired");

    // Only households in this space can be picked.
    await expect(requestAccess(h.db, { inviteCode, participantId: "nope" })).rejects.toThrow(/isn't in this group/);
    await expect(requestAccess(h.db, { inviteCode: "bad", participantId: smithId })).rejects.toThrow(/invite/);
  });

  it("doesn't quietly create a second household, and lets people set their email", async () => {
    const { h, patel, smith, inviteCode, spaceId } = await smallSpace();
    await expect(h.as(null).call("join_space", { inviteCode, displayName: " patel ", consent: true })).rejects.toThrow(/Get back in/);
    await expect(
      h.as(null).call("join_space", { inviteCode, displayName: "Someone new", email: "NGUYEN@example.org", consent: true }),
    ).rejects.toThrow(/Get back in/);

    expect((await h.as(patel.accountId).call("get_my_account")).email).toBeNull();
    await h.as(patel.accountId).call("update_my_email", { email: " Patel@Example.org " });
    expect((await h.as(patel.accountId).call("get_my_account")).email).toBe("patel@example.org");
    await expect(h.as(smith.accountId).call("update_my_email", { email: "patel@example.org" })).rejects.toThrow(/already used/);
    expect((await h.as(patel.accountId).call("get_space", { spaceId })).me.needsEmail).toBe(false); // email sign-in off in tests
  });

  it("signs out other devices and old links", async () => {
    const { h, patel } = await smallSpace();
    const here = await createSession(h.db, patel.accountId);
    const there = await createSession(h.db, patel.accountId);
    const link = await rotatePersonalLink(h.db, patel.accountId, "https://app.test");
    const { ended } = await endOtherSessions(h.db, patel.accountId, here);
    expect(ended).toBe(1);
    expect(await accountForSession(h.db, here)).toBe(patel.accountId);
    expect(await accountForSession(h.db, there)).toBeNull();
    expect(await consumeLinkToken(h.db, link.split("/auth/")[1])).toBeNull();
  });
});
