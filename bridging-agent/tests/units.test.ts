import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { expandSchedule, nextWeekday, weekdayOf, zonedTime } from "@/engine/schedule";
import { buildCalendar } from "@/engine/ics";
import { constraintConflicts, hardConstraints, parseFieldValue, splitList } from "@/engine/values";
import { getTemplate, listTemplates, TemplateSchema } from "@/engine/template";
import { intakeTurn, mapStage, profileDraft, proposalsStage, reviseStage } from "@/engine/agent/stages";
import { loadPrompt } from "@/engine/agent/prompts";
import { describeTools } from "@/engine/tools";

describe("schedule", () => {
  it("expands weekly, fortnightly and monthly schedules on the right weekday", () => {
    expect(weekdayOf("2026-10-01")).toBe("Thu");
    expect(nextWeekday("2026-09-30", "Thu")).toBe("2026-10-01");
    expect(expandSchedule({ weekday: "Thu", cadence: "fortnightly", startDate: "2026-09-30", occurrences: 3, time: "18:00" })).toEqual([
      "2026-10-01",
      "2026-10-15",
      "2026-10-29",
    ]);
    // Monthly: same nth weekday of each month (first Thursday).
    expect(expandSchedule({ weekday: "Thu", cadence: "monthly", startDate: "2026-10-01", occurrences: 3, time: "18:00" })).toEqual([
      "2026-10-01",
      "2026-11-05",
      "2026-12-03",
    ]);
  });

  it("converts local times across the Sydney daylight-saving change", () => {
    // AEST (UTC+10) before 4 Oct 2026, AEDT (UTC+11) after.
    expect(zonedTime("2026-10-01", "18:00", "Australia/Sydney").toISOString()).toBe("2026-10-01T08:00:00.000Z");
    expect(zonedTime("2026-10-08", "18:00", "Australia/Sydney").toISOString()).toBe("2026-10-08T07:00:00.000Z");
  });
});

describe("ics", () => {
  it("escapes text, folds long lines and includes an alarm", () => {
    const ics = buildCalendar(
      "Meals",
      [
        {
          uid: "abc@x",
          sequence: 2,
          start: new Date("2026-10-01T08:00:00Z"),
          durationMinutes: 120,
          summary: "Bring the main; Thai, please",
          description: "A".repeat(200),
          location: "Rooftop",
          alarmMinutes: 180,
        },
      ],
      new Date("2026-09-23T00:00:00Z"),
    );
    expect(ics).toContain("SUMMARY:Bring the main\\; Thai\\, please");
    expect(ics).toContain("DTSTART:20261001T080000Z");
    expect(ics).toContain("DTEND:20261001T100000Z");
    expect(ics).toContain("TRIGGER:-PT180M");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe("values and constraints", () => {
  it("parses dictated answers into field values", () => {
    const t = getTemplate("community-meals");
    const f = (k: string) => t.profileFields.find((x) => x.key === k)!;
    expect(splitList("We love Thai, Italian and Mexican.")).toEqual(["Thai", "Italian", "Mexican"]);
    expect(parseFieldValue(f("allergies"), "none")).toEqual([]);
    expect(parseFieldValue(f("free_weeknights"), "Mondays or thursdays")).toEqual(["Mon", "Thu"]);
    expect(parseFieldValue(f("household_size"), "Five of us")).toBe(5);
    expect(parseFieldValue(f("cooking_confidence"), "pretty comfortable")).toBe("Comfortable");
  });

  it("builds anonymous hard constraints and flags conflicting themes", () => {
    const t = getTemplate("community-meals");
    const c = hardConstraints(t, [
      { fields: { dietary_requirements: { value: ["No pork"], visibility: "group" }, allergies: { value: ["Peanuts"], visibility: "agent" } } },
      { fields: { dietary_requirements: { value: ["Vegetarian"], visibility: "group" }, allergies: { value: [], visibility: "agent" } } },
    ]);
    expect(c.labels).toEqual(["Allergy: peanuts", "Dietary requirement: no pork", "Dietary requirement: vegetarian"]);
    expect(constraintConflicts("Pork belly night", c.forbidden)).toEqual(["pork"]);
    expect(constraintConflicts("Satay with peanut sauce", c.forbidden)).toEqual(["peanuts"]);
    expect(constraintConflicts("Vegetarian curry", c.forbidden)).toEqual([]);
  });
});

describe("templates, prompts and tools", () => {
  it("validates every template and rejects a broken one", () => {
    expect(listTemplates().map((t) => t.id)).toEqual(["community-meals", "coalition"]);
    const bad = structuredClone(getTemplate("community-meals"));
    bad.intake.topics[0].fieldKeys = ["nope"];
    expect(TemplateSchema.safeParse(bad).success).toBe(false);
  });

  it("builds a valid structured-output schema for every stage and template", () => {
    for (const t of listTemplates()) {
      for (const stage of [intakeTurn, profileDraft, mapStage, proposalsStage, reviseStage]) {
        expect(() => betaZodOutputFormat(stage.schema(t) as never)).not.toThrow();
        expect(loadPrompt(stage.promptId).version).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("describes every tool with a JSON input schema (MCP-ready)", () => {
    const tools = describeTools();
    expect(tools.length).toBeGreaterThan(30);
    for (const t of tools) {
      expect(t.inputSchema).toHaveProperty("type", "object");
      expect(["personal", "group", "host"]).toContain(t.layer);
    }
  });
});
