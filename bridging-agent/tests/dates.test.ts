import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { formatDateValue, isAway, normaliseDates, parseDatesFromText } from "@/engine/dates";
import { expandSchedule } from "@/engine/schedule";
import { absenceSummary, fitSchedule } from "@/engine/availability";
import { profiles } from "@/engine/db/schema";
import { mealSpace, setup } from "./helpers";

const unit = { singular: "household", plural: "households" };

describe("away dates: parsing and scheduling", () => {
  it("reads dates and ranges out of free text, resolving the year from today", () => {
    const today = "2026-09-23";
    expect(parseDatesFromText("We are away on the 15th of October, and 10-20 Dec", today)).toEqual([
      "2026-10-15",
      "2026-12-10/2026-12-20",
    ]);
    expect(parseDatesFromText("Dec 28 to Jan 3", today)).toEqual(["2026-12-28/2027-01-03"]);
    expect(parseDatesFromText("1 Sep", today)).toEqual(["2027-09-01"]); // already passed this year
    expect(parseDatesFromText("2026-11-05", today)).toEqual(["2026-11-05"]);
    expect(parseDatesFromText("None that I know of", today)).toEqual([]);
    expect(normaliseDates(["2026-12-20/2026-12-10", "bad", "2026-10-15", "2026-10-15"])).toEqual([
      "2026-10-15",
      "2026-12-10/2026-12-20",
    ]);
    expect(formatDateValue("2026-12-10/2026-12-20")).toBe("10–20 Dec");
    expect(formatDateValue("2026-12-28/2027-01-03")).toBe("28 Dec – 3 Jan");
    expect(isAway("2026-12-12", ["2026-12-10/2026-12-20"])).toBe(true);
  });

  it("skips dates and fills in later ones", () => {
    expect(
      expandSchedule({ weekday: "Thu", cadence: "fortnightly", startDate: "2026-10-01", occurrences: 3, time: "18:00", skipDates: ["2026-10-15"] }),
    ).toEqual(["2026-10-01", "2026-10-29", "2026-11-12"]);
  });

  it("fits a schedule around absences", () => {
    // 2 of 5 away on 15 Oct (over a third): skipped. 1 of 5 on 29 Oct: kept, but reported.
    const away = { "2026-10-15": 2, "2026-10-29": 1 };
    const fit = fitSchedule({ weekday: "Thu", cadence: "fortnightly", occurrences: 3 }, "2026-09-30", away, 5);
    const dates = expandSchedule({ weekday: "Thu", cadence: "fortnightly", occurrences: 3, time: "18:00", ...fit });
    expect(dates).not.toContain("2026-10-15");
    expect(dates.length).toBe(3);
    expect(absenceSummary(["2026-10-01", "2026-10-29"], away, unit)).toBe("Known absences: 29 Oct (1 household away).");
    expect(absenceSummary(["2026-10-01"], away, unit)).toMatch(/^No household/);
  });
});

describe("away dates: through the meal cycle", () => {
  it("drafts around absences, revises for a named date, and never suggests someone who's away", async () => {
    const h = await setup();
    const { spaceId, accounts } = await mealSpace(h);
    const host = h.as(accounts.Nguyen);

    const mine = await host.call("get_my_profile", { spaceId });
    expect(mine.profile.fields.unavailable_dates).toEqual({ value: ["2026-10-15", "2026-12-10/2026-12-20"], visibility: "agent" });
    // Others never see the dates.
    const asSmith = await h.as(accounts.Smith).call("get_group_profiles", { spaceId });
    expect(asSmith.find((p: any) => p.displayName === "Nguyen").fields.map((f: any) => f.key)).not.toContain("unavailable_dates");

    await host.call("generate_map", { spaceId });
    const { proposalIds } = await host.call("draft_proposals", { spaceId });
    let list = await host.call("list_proposals", { spaceId });
    const fortnightlyThu = list.proposals.find((p: any) => p.id === proposalIds[0]);
    // Starting on 1 Oct would hit 15 Oct (two households away) and 12 Nov (one). Starting a week
    // later clears every known absence.
    expect(fortnightlyThu.dates.map((d: any) => d.date)).toEqual(["2026-10-08", "2026-10-22", "2026-11-05", "2026-11-19"]);
    expect(fortnightlyThu.dates.every((d: any) => d.away === 0)).toBe(true);
    expect(fortnightlyThu.tradeoffs).toContain("No household has said they're away on any of these dates.");

    // An objection naming a date gets that date skipped; later dates fill in.
    await host.call("release_proposal", { spaceId, proposalId: fortnightlyThu.id });
    await h.as(accounts.Smith).call("respond_to_proposal", {
      spaceId,
      proposalId: fortnightlyThu.id,
      signal: "object",
      reason: "We're away on 19 Nov",
    });
    const { proposalId: revisedId } = await host.call("draft_revision", { spaceId, proposalId: fortnightlyThu.id });
    list = await host.call("list_proposals", { spaceId });
    const revised = list.proposals.find((p: any) => p.id === revisedId);
    expect(revised.schedule.skipDates).toEqual(["2026-11-19"]);
    expect(revised.dates.map((d: any) => d.date)).toEqual(["2026-10-08", "2026-10-22", "2026-11-05", "2026-12-03"]);
    // The absence line is recomputed, not duplicated.
    expect(revised.tradeoffs.filter((t: string) => / away on any of these dates|^Known absences/.test(t)).length).toBe(1);

    await host.call("release_proposal", { spaceId, proposalId: revisedId });
    await h.as(accounts.Patel).call("respond_to_proposal", { spaceId, proposalId: revisedId, signal: "support" });
    await host.call("adopt_proposal", { spaceId, proposalId: revisedId });

    // Plans change: Patel adds a date after the plan is agreed.
    const patel = h.as(accounts.Patel);
    await patel.call("update_my_profile", {
      spaceId,
      fields: { unavailable_dates: { value: ["2026-10-15", "2026-10-22"] } },
    });
    const patelId = (await patel.call("get_space", { spaceId })).me.participantId;
    const asHost = await host.call("get_plan", { spaceId });
    const oct22 = asHost.events.find((e: any) => e.startsAt.toISOString().startsWith("2026-10-22"));
    expect(oct22.away).toBe(1);
    expect(oct22.meAway).toBe(false);
    expect(oct22.commitments.every((c: any) => c.suggestion?.participantId !== patelId)).toBe(true);
    const asPatel = await patel.call("get_plan", { spaceId });
    expect(asPatel.events.find((e: any) => e.id === oct22.id).meAway).toBe(true);
  });

  it("asks families who approved before the question existed to add their dates", async () => {
    const h = await setup();
    const { spaceId, accounts } = await mealSpace(h);
    const patel = h.as(accounts.Patel);
    expect((await patel.call("get_space", { spaceId })).progress.needsAwayDates).toBe(false);

    // Simulate a profile approved before the template had the field.
    const { profile } = await patel.call("get_my_profile", { spaceId });
    const { unavailable_dates: _, ...older } = profile.fields;
    await h.db.update(profiles).set({ fields: older }).where(eq(profiles.id, profile.id));
    expect((await patel.call("get_space", { spaceId })).progress.needsAwayDates).toBe(true);
    const overview = await h.as(accounts.Nguyen).call("host_overview", { spaceId });
    expect(overview.participants.find((p: any) => p.displayName === "Patel").awayDatesAnswered).toBe(false);
    expect(overview.awayDatesWhatsapp).toContain("wa.me");

    // Adding them on the profile (an answer of "none" counts too) clears the prompt.
    await patel.call("update_my_profile", { spaceId, fields: { unavailable_dates: { value: ["2026-11-05"] } } });
    expect((await patel.call("get_space", { spaceId })).progress.needsAwayDates).toBe(false);
    const after = await patel.call("get_my_profile", { spaceId });
    expect(after.profile.fields.unavailable_dates).toEqual({ value: ["2026-11-05"], visibility: "agent" });
  });
});
