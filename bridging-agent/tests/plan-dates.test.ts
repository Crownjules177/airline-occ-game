import { describe, expect, it } from "vitest";
import { setup, mealSpace } from "./helpers";
import { calendarFeed } from "@/engine/tools/plan";
import { participants } from "@/engine/db/schema";
import { eq } from "drizzle-orm";

async function planned() {
  const h = await setup();
  const { spaceId, accounts } = await mealSpace(h);
  const host = h.as(accounts.Nguyen);
  await host.call("generate_map", { spaceId });
  const { proposalIds } = await host.call("draft_proposals", { spaceId });
  await host.call("release_proposal", { spaceId, proposalId: proposalIds[0] });
  await h.as(accounts.Smith).call("respond_to_proposal", { spaceId, proposalId: proposalIds[0], signal: "support" });
  await host.call("adopt_proposal", { spaceId, proposalId: proposalIds[0] });
  return { h, spaceId, accounts, host };
}

describe("changing dates on an agreed plan", () => {
  it("lets a household say it can't make one date, frees its part and counts it anonymously", async () => {
    const { h, spaceId, accounts } = await planned();
    const smith = h.as(accounts.Smith);
    let plan = await smith.call("get_plan", { spaceId });
    const ev = plan.events.find((e: any) => !e.meAway);
    expect(ev.households).toBe(5);
    const before = ev.coming;
    const part = ev.commitments[0];
    await smith.call("claim_commitment", { spaceId, commitmentId: part.id });

    const r = await smith.call("set_my_attendance", { spaceId, eventId: ev.id, status: "away" });
    expect(r.released).toEqual([part.part]);
    expect(decodeURIComponent(r.whatsapp)).toContain(`take the ${part.part.toLowerCase()}`);

    plan = await smith.call("get_plan", { spaceId });
    let e = plan.events.find((x: any) => x.id === ev.id);
    expect(e.coming).toBe(before - 1);
    expect(e.meAway).toBe(true);
    expect(e.commitments[0]).toMatchObject({ status: "open", who: null });
    // Nobody else learns who: just the count.
    const asPatel = await h.as(accounts.Patel).call("get_plan", { spaceId });
    const forPatel = asPatel.events.find((x: any) => x.id === ev.id);
    expect(forPatel.coming).toBe(before - 1);
    expect(forPatel.meAway).toBe(false);
    expect(JSON.stringify(forPatel)).not.toContain("Smith");
    // And they're no longer suggested for that date.
    expect(e.commitments.every((c: any) => c.suggestion?.who !== "Smith")).toBe(true);

    await smith.call("set_my_attendance", { spaceId, eventId: ev.id, status: "coming" });
    e = (await smith.call("get_plan", { spaceId })).events.find((x: any) => x.id === ev.id);
    expect(e.coming).toBe(before);
  });

  it("flags a date too few can make, suggests better ones, and the host moves it", async () => {
    const { h, spaceId, accounts, host } = await planned();
    let plan = await host.call("get_plan", { spaceId });
    const ev = plan.events[1];
    // Patel claims a part, then three households can't make it.
    const part = ev.commitments[0];
    await h.as(accounts.Patel).call("claim_commitment", { spaceId, commitmentId: part.id });
    for (const n of ["Okafor", "Smith", "Haddad"]) await h.as(accounts[n]).call("set_my_attendance", { spaceId, eventId: ev.id, status: "away" });
    plan = await host.call("get_plan", { spaceId });
    let e = plan.events.find((x: any) => x.id === ev.id);
    expect(e.attention.join()).toMatch(/Only \d of 5 can come/);

    await expect(h.as(accounts.Patel).call("suggest_event_dates", { spaceId, eventId: ev.id })).rejects.toThrow(/host/);
    const s = await host.call("suggest_event_dates", { spaceId, eventId: ev.id });
    expect(s.options.length).toBeGreaterThan(0);
    const taken = plan.events.map((x: any) => x.date);
    for (const o of s.options) {
      expect(o.date).not.toBe(e.date);
      expect(taken).not.toContain(o.date);
    }
    for (let i = 1; i < s.options.length; i++) expect(s.options[i - 1].coming).toBeGreaterThanOrEqual(s.options[i].coming);

    const [participant] = await h.db.select().from(participants).where(eq(participants.accountId, accounts.Patel));
    const feedBefore = (await calendarFeed({ db: h.db, appUrl: "https://app.test", now: new Date() }, participant.calendarToken))!;
    const seqBefore = Number(/SEQUENCE:(\d+)/.exec(feedBefore)![1]);

    await expect(h.as(accounts.Patel).call("move_event", { spaceId, eventId: ev.id, date: s.options[0].date })).rejects.toThrow(/host/);
    const moved = await host.call("move_event", { spaceId, eventId: ev.id, date: s.options[0].date });
    expect(decodeURIComponent(moved.whatsapp)).toContain("Change of date");

    plan = await host.call("get_plan", { spaceId });
    e = plan.events.find((x: any) => x.id === ev.id);
    expect(e.date).toBe(s.options[0].date);
    expect(new Date(e.movedFrom).getTime()).toBe(new Date(ev.startsAt).getTime());
    // Answers about the old day are gone; the part stays with Patel if they're free.
    expect(e.coming).toBe(s.options[0].coming);
    if (!moved.freed.length) expect(e.commitments.find((c: any) => c.id === part.id).who).toBe("Patel");
    // Calendars update.
    const feedAfter = (await calendarFeed({ db: h.db, appUrl: "https://app.test", now: new Date() }, participant.calendarToken))!;
    expect(Number(/SEQUENCE:(\d+)/.exec(feedAfter)![1])).toBeGreaterThan(seqBefore);

    await expect(host.call("move_event", { spaceId, eventId: ev.id, date: "2020-01-01" })).rejects.toThrow(/today/);
  });

  it("frees a claimed part when its household is away on the new date", async () => {
    const { h, spaceId, accounts, host } = await planned();
    const plan = await host.call("get_plan", { spaceId });
    const ev = plan.events[0];
    const target = plan.events[plan.events.length - 1].date.replace(/-\d\d$/, "-28");
    await h.as(accounts.Okafor).call("update_my_profile", { spaceId, fields: { unavailable_dates: { value: [target] } } });
    const part = ev.commitments[0];
    await h.as(accounts.Okafor).call("claim_commitment", { spaceId, commitmentId: part.id });
    const moved = await host.call("move_event", { spaceId, eventId: ev.id, date: target, time: "17:30" });
    expect(moved.freed).toEqual([part.part]);
    const e = (await host.call("get_plan", { spaceId })).events.find((x: any) => x.id === ev.id);
    expect(e.commitments.find((c: any) => c.id === part.id).status).toBe("open");
  });

  it("skips a date and puts it back, keeping claimed parts", async () => {
    const { h, spaceId, accounts, host } = await planned();
    let plan = await host.call("get_plan", { spaceId });
    const ev = plan.events[0];
    await h.as(accounts.Haddad).call("claim_commitment", { spaceId, commitmentId: ev.commitments[0].id });
    await expect(h.as(accounts.Haddad).call("skip_event", { spaceId, eventId: ev.id, skip: true })).rejects.toThrow(/host/);
    await host.call("skip_event", { spaceId, eventId: ev.id, skip: true });

    plan = await host.call("get_plan", { spaceId });
    let e = plan.events.find((x: any) => x.id === ev.id);
    expect(e.status).toBe("skipped");
    expect(e.attention).toEqual([]);
    const [participant] = await h.db.select().from(participants).where(eq(participants.accountId, accounts.Haddad));
    const feed = (await calendarFeed({ db: h.db, appUrl: "https://app.test", now: new Date() }, participant.calendarToken))!;
    expect(feed).toContain("STATUS:CANCELLED");

    await host.call("skip_event", { spaceId, eventId: ev.id, skip: false });
    e = (await host.call("get_plan", { spaceId })).events.find((x: any) => x.id === ev.id);
    expect(e.status).toBe("scheduled");
    expect(e.commitments[0].who).toBe("Haddad");
  });
});
