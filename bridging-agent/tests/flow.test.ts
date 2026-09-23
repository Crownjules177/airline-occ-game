import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setup, mealSpace, runIntake, answers } from "./helpers";
import { agentCalls } from "@/engine/db/schema";
import { calendarFeed } from "@/engine/tools/plan";

describe("community meal cycle, end to end (mock agent)", () => {
  it("runs intake → map → agree → act, with provenance, privacy and constraints enforced", async () => {
    const h = await setup();
    const { spaceId, accounts } = await mealSpace(h);
    const host = h.as(accounts.Nguyen);
    const patel = h.as(accounts.Patel);

    // Intake produced structured profiles with template defaults.
    const mine = await host.call("get_my_profile", { spaceId });
    expect(mine.profile.status).toBe("approved");
    expect(mine.profile.fields.household_size.value).toBe(4);
    expect(mine.profile.fields.dietary_requirements.value).toEqual(["No pork"]);
    expect(mine.profile.fields.allergies).toEqual({ value: ["Tree nuts"], visibility: "agent" });
    expect(mine.profile.fields.free_weeknights.value).toEqual(["Tue", "Thu"]);
    expect(mine.profile.fields.parts_enjoyed.value).toEqual(["Main", "Dessert"]);

    // Map.
    await host.call("generate_map", { spaceId });
    const { map, sources } = await patel.call("get_map", { spaceId });
    expect(map.items.length).toBeGreaterThan(3);
    const italian = map.items.find((i: any) => i.kind === "agreement" && i.title.startsWith("Italian"));
    expect(italian.sourceContributionIds.length).toBe(4);
    for (const id of italian.sourceContributionIds) expect(sources[id].author).toBeTruthy();
    expect(map.items.some((i: any) => i.minority)).toBe(true);
    const constraint = map.items.find((i: any) => i.kind === "constraint");
    expect(constraint.detail).toContain("Allergy: tree nuts");
    expect(constraint.sourceContributionIds).toEqual([]);
    // The pairing between someone who wants to learn dumplings and someone who loves them.
    expect(map.items.some((i: any) => i.kind === "pairing" && /dumplings/i.test(i.title))).toBe(true);
    // No map text links a household to its allergy.
    const text = JSON.stringify(map.items);
    expect(text).not.toMatch(/Nguyen[^"]*tree nuts/i);
    expect(text).not.toMatch(/Smith[^"]*shellfish/i);

    // Agree: drafts are host-only until released.
    const { proposalIds } = await host.call("draft_proposals", { spaceId });
    expect(proposalIds.length).toBeGreaterThanOrEqual(2);
    expect((await patel.call("list_proposals", { spaceId })).proposals).toHaveLength(0);
    const { proposals } = await host.call("list_proposals", { spaceId });
    for (const p of proposals) {
      expect(p.constraints).toEqual(expect.arrayContaining(["Allergy: tree nuts", "Dietary requirement: no pork"]));
      expect(p.schedule.startDate >= "2026-09-30").toBe(true);
      expect(p.schedule.weekday).toBe(p.schedule.weekday);
    }
    const first = proposals.find((p: any) => p.id === proposalIds[0]);
    expect(first.schedule.weekday).toBe("Thu"); // suits all five
    await host.call("release_proposal", { spaceId, proposalId: first.id });

    // An objection blocks adoption and triggers a revision instead of a majority override.
    await patel.call("respond_to_proposal", { spaceId, proposalId: first.id, signal: "support" });
    await h.as(accounts.Okafor).call("respond_to_proposal", {
      spaceId,
      proposalId: first.id,
      signal: "object",
      reason: "Fortnightly is too often for us with three kids",
    });
    await expect(host.call("adopt_proposal", { spaceId, proposalId: first.id })).rejects.toThrow(/objections/);
    await expect(
      h.as(accounts.Smith).call("respond_to_proposal", { spaceId, proposalId: first.id, signal: "object" }),
    ).rejects.toThrow(/why/);

    const { proposalId: revisedId } = await host.call("draft_revision", { spaceId, proposalId: first.id });
    await host.call("release_proposal", { spaceId, proposalId: revisedId });
    const after = await host.call("list_proposals", { spaceId });
    const revised = after.proposals.find((p: any) => p.id === revisedId);
    expect(revised.version).toBe(2);
    expect(revised.parentId).toBe(first.id);
    expect(revised.schedule.cadence).toBe("monthly");
    expect(after.proposals.find((p: any) => p.id === first.id).status).toBe("superseded");
    // Provenance: the revision cites the objection.
    expect(revised.sourceContributionIds.length).toBeGreaterThan(0);

    for (const name of ["Nguyen", "Patel", "Okafor", "Smith", "Haddad"]) {
      await h.as(accounts[name]).call("respond_to_proposal", {
        spaceId,
        proposalId: revisedId,
        signal: name === "Smith" ? "live_with" : "support",
      });
    }
    await host.call("adopt_proposal", { spaceId, proposalId: revisedId });

    // Act.
    const plan = await patel.call("get_plan", { spaceId });
    expect(plan.events.length).toBe(4);
    const dates = plan.events.map((e: any) => new Date(e.startsAt));
    for (const d of dates) {
      expect(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short" }).format(d)).toBe("Thu");
      expect(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false }).format(d)).toBe("18:00");
    }
    expect(plan.events[0].commitments.map((c: any) => c.part)).toEqual(["Main", "Side", "Salad", "Dessert"]);

    // Suggestions are only shown to the person they're for (and the host).
    const forPatel = plan.events.flatMap((e: any) => e.commitments).filter((c: any) => c.suggestion);
    expect(forPatel.every((c: any) => c.suggestion.forMe)).toBe(true);
    expect(forPatel.length).toBeGreaterThan(0);

    const task = forPatel[0];
    await patel.call("claim_commitment", { spaceId, commitmentId: task.id });
    await expect(h.as(accounts.Smith).call("claim_commitment", { spaceId, commitmentId: task.id })).rejects.toThrow(/already/);

    // Calendar feed.
    const patelProfile = await patel.call("get_plan", { spaceId });
    const token = patelProfile.feedUrl.split("/api/cal/")[1];
    const ics = await calendarFeed({ db: h.db, appUrl: "https://app.test", now: new Date() }, token);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain(`UID:${task.id}@bridging-agent`);
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("tree nuts");
    expect(ics).not.toMatch(/Nguyen/);

    // Audit: every agent call logged with prompt version.
    const calls = await h.db.select().from(agentCalls).where(eq(agentCalls.spaceId, spaceId));
    expect(new Set(calls.map((c) => c.stage))).toEqual(new Set(["intake", "profile", "map", "proposals", "revise"]));
    expect(calls.every((c) => c.promptVersion >= 1 && c.model === "mock")).toBe(true);
    const log = await host.call("get_audit_log", { spaceId });
    expect(log.events.some((e: any) => e.action === "plan.adopted")).toBe(true);
    await expect(patel.call("get_audit_log", { spaceId })).rejects.toThrow(/host/);
  });
});

describe("visibility", () => {
  it("shows group fields to everyone, host fields to the host, agent-only fields to nobody else", async () => {
    const h = await setup();
    const { spaceId, accounts } = await mealSpace(h);
    // Patel makes their weeknights host-only.
    await h.as(accounts.Patel).call("update_my_profile", {
      spaceId,
      fields: { free_weeknights: { visibility: "host" } },
    });

    const asSmith = await h.as(accounts.Smith).call("get_group_profiles", { spaceId });
    const asHost = await h.as(accounts.Nguyen).call("get_group_profiles", { spaceId });
    const keys = (list: any[], name: string) => list.find((p) => p.displayName === name).fields.map((f: any) => f.key);

    expect(keys(asSmith, "Nguyen")).not.toContain("allergies");
    expect(keys(asHost, "Smith")).not.toContain("allergies");
    expect(keys(asSmith, "Patel")).not.toContain("free_weeknights");
    expect(keys(asHost, "Patel")).toContain("free_weeknights");
    expect(keys(asSmith, "Patel")).toContain("cuisines_loved");
    // Own profile shows everything.
    expect(keys(asSmith, "Smith")).toContain("allergies");
  });

  it("hides unapproved profiles and removes shared contributions when a field goes private", async () => {
    const h = await setup();
    const host = await h.as(null).call("create_space", { name: "S", templateId: "community-meals", displayName: "A", consent: true });
    const { inviteUrl } = await h.as(host.accountId).call("get_space", { spaceId: host.spaceId });
    const b = await h.as(null).call("join_space", { inviteCode: inviteUrl.split("/join/")[1], displayName: "B", consent: true });
    await runIntake(h, b.accountId, host.spaceId, answers.Patel);

    let view = await h.as(host.accountId).call("get_group_profiles", { spaceId: host.spaceId });
    expect(view.find((p: any) => p.displayName === "B")).toMatchObject({ status: "draft", summary: null, fields: [] });

    await h.as(b.accountId).call("update_my_profile", { spaceId: host.spaceId, approve: true });
    view = await h.as(host.accountId).call("get_group_profiles", { spaceId: host.spaceId });
    expect(view.find((p: any) => p.displayName === "B").fields.length).toBeGreaterThan(3);

    const { exportMyData } = await import("@/engine/tools/data");
    const before = await exportMyData.run(h.ctx(b.accountId), { spaceId: host.spaceId });
    expect(before.contributions.some((c) => c.fieldKey === "cuisines_loved")).toBe(true);
    await h.as(b.accountId).call("update_my_profile", {
      spaceId: host.spaceId,
      fields: { cuisines_loved: { visibility: "agent" } },
    });
    const after = await exportMyData.run(h.ctx(b.accountId), { spaceId: host.spaceId });
    expect(after.contributions.some((c) => c.fieldKey === "cuisines_loved")).toBe(false);
    expect(after.profileHistory.length).toBe(2);
  });

  it("requires the approval threshold for the map unless the host forces it", async () => {
    const h = await setup();
    const host = await h.as(null).call("create_space", { name: "S", templateId: "community-meals", displayName: "A", consent: true });
    const { inviteUrl } = await h.as(host.accountId).call("get_space", { spaceId: host.spaceId });
    await h.as(null).call("join_space", { inviteCode: inviteUrl.split("/join/")[1], displayName: "B", consent: true });
    await runIntake(h, host.accountId, host.spaceId, answers.Nguyen);
    await h.as(host.accountId).call("update_my_profile", { spaceId: host.spaceId, approve: true });
    await expect(h.as(host.accountId).call("generate_map", { spaceId: host.spaceId })).rejects.toThrow(/needs 70%/);
    await h.as(host.accountId).call("generate_map", { spaceId: host.spaceId, force: true });
  });

  it("lets a participant delete their data and reopens their tasks", async () => {
    const h = await setup();
    const { spaceId, accounts } = await mealSpace(h);
    const host = h.as(accounts.Nguyen);
    await host.call("generate_map", { spaceId });
    const { proposalIds } = await host.call("draft_proposals", { spaceId });
    await host.call("release_proposal", { spaceId, proposalId: proposalIds[0] });
    await h.as(accounts.Smith).call("respond_to_proposal", { spaceId, proposalId: proposalIds[0], signal: "support" });
    await host.call("adopt_proposal", { spaceId, proposalId: proposalIds[0] });
    const plan = await h.as(accounts.Smith).call("get_plan", { spaceId });
    const id = plan.events[0].commitments[0].id;
    await h.as(accounts.Smith).call("claim_commitment", { spaceId, commitmentId: id });

    const res = await h.as(accounts.Smith).call("delete_my_data", { spaceId, confirm: true });
    expect(res.accountDeleted).toBe(true);
    const after = await host.call("get_plan", { spaceId });
    expect(after.events[0].commitments[0]).toMatchObject({ status: "open", who: null });
    const people = await host.call("get_group_profiles", { spaceId });
    expect(people.map((p: any) => p.displayName)).not.toContain("Smith");
    await expect(host.call("delete_my_data", { spaceId, confirm: true })).rejects.toThrow(/Hosts/);
  });
});
