import { z } from "zod";
import type { Stage } from "./service";
import { WEEKDAYS, type Template, type Weekday } from "../template";
import type { FieldValue, MapItem, TranscriptMessage } from "../db/schema";
import { parseFieldValue, parseWeekdays, valuesOf } from "../values";

const json = (label: string, data: unknown) => `<${label}>\n${JSON.stringify(data, null, 2)}\n</${label}>`;

function templateBrief(t: Template) {
  return {
    name: t.name,
    description: t.description,
    participantUnit: t.unitLabel.singular,
    fields: t.profileFields.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      type: f.type,
      options: f.options,
      constraint: f.constraint,
      defaultVisibility: f.defaultVisibility,
    })),
  };
}

// =============================================================================================
// Intake: one conversational turn
// =============================================================================================

export type IntakeTurnInput = {
  displayName: string;
  transcript: TranscriptMessage[];
  topicsCovered: string[];
};
export type IntakeTurnOutput = { reply: string; topicsCovered: string[]; readyToDraft: boolean };

export const intakeTurn: Stage<IntakeTurnInput, IntakeTurnOutput> = {
  promptId: "intake",
  effort: "low",
  schema: (t) =>
    z.object({
      reply: z.string().describe("Your next message to the participant."),
      topicsCovered: z.array(z.enum(t.intake.topics.map((x) => x.id) as [string, ...string[]])),
      readyToDraft: z.boolean(),
    }),
  render: (input, t) =>
    [
      json("template", {
        ...templateBrief(t),
        intro: t.intake.intro,
        targetMinutes: t.intake.targetMinutes,
        topics: t.intake.topics,
      }),
      json("participant", { name: input.displayName }),
      json("topics_already_covered", input.topicsCovered),
      json("transcript", input.transcript.map((m) => ({ from: m.role, text: m.text }))),
      "Write the next agent message.",
    ].join("\n\n"),
  mock: (input, t) => {
    const answers = input.transcript.filter((m) => m.role === "participant").length;
    const covered = t.intake.topics.slice(0, answers).map((x) => x.id);
    const next = t.intake.topics[answers];
    if (!next) {
      return {
        reply:
          "Thank you, that's everything I need. Tap \"Draft my profile\" and I'll write a short summary for you to check. Nothing is shared until you approve it.",
        topicsCovered: covered,
        readyToDraft: true,
      };
    }
    return { reply: `Thanks. ${next.question}`, topicsCovered: covered, readyToDraft: false };
  },
};

/** The opening message is the host-configured intro plus the first question, with no model call. */
export function intakeOpening(t: Template): string {
  return `${t.intake.intro}\n\n${t.intake.topics[0].question}`;
}

// =============================================================================================
// Intake: draft a profile from the transcript
// =============================================================================================

export type ProfileDraftInput = { displayName: string; transcript: TranscriptMessage[] };
export type ProfileDraftOutput = { summary: string; fields: Record<string, FieldValue> };

function fieldSchema(f: Template["profileFields"][number]) {
  const d = f.description;
  switch (f.type) {
    case "text":
      return z.string().nullable().describe(d);
    case "number":
      return z.number().nullable().describe(d);
    case "list":
      return z.array(z.string()).describe(d);
    case "weekdays":
      return z.array(z.enum(WEEKDAYS)).describe(d);
    case "choice":
      return z.enum(f.options as [string, ...string[]]).nullable().describe(d);
    case "multi":
      return z.array(z.enum(f.options as [string, ...string[]])).describe(d);
  }
}

export const profileDraft: Stage<ProfileDraftInput, ProfileDraftOutput> = {
  promptId: "profile",
  effort: "medium",
  schema: (t) =>
    z.object({
      summary: z.string(),
      fields: z.object(Object.fromEntries(t.profileFields.map((f) => [f.key, fieldSchema(f)]))),
    }) as unknown as z.ZodType<ProfileDraftOutput>,
  render: (input, t) =>
    [
      json("template", templateBrief(t)),
      json("participant", { name: input.displayName }),
      json("transcript", input.transcript.map((m) => ({ from: m.role, text: m.text }))),
      "Draft the profile.",
    ].join("\n\n"),
  mock: (input, t) => {
    // Pair each answer with the question before it, then parse the answer for that topic's fields.
    const fields: Record<string, FieldValue> = {};
    let topic: Template["intake"]["topics"][number] | undefined;
    for (const m of input.transcript) {
      if (m.role === "agent") {
        topic = t.intake.topics.find((x) => m.text.includes(x.question)) ?? topic;
        continue;
      }
      if (!topic) continue;
      for (const key of topic.fieldKeys) {
        const field = t.profileFields.find((f) => f.key === key)!;
        fields[key] = parseFieldValue(field, m.text);
      }
    }
    const shared = t.profileFields
      .filter((f) => f.defaultVisibility === "group" && valuesOf(fields[f.key] ?? null).length > 0)
      .slice(0, 4)
      .map((f) => `${f.label.toLowerCase()}: ${valuesOf(fields[f.key] ?? null).join(", ")}`);
    const summary = shared.length
      ? `${input.displayName}. ${shared.join("; ")}.`
      : `${input.displayName} has started their profile.`;
    return { summary, fields };
  },
};

// =============================================================================================
// Map
// =============================================================================================

export type SharedContribution = { id: string; author: string; field: string | null; text: string; values: string[] };

export type MapInput = {
  participantCount: number;
  approvedCount: number;
  sharedContributions: SharedContribution[];
  ideas: SharedContribution[];
  constraints: string[];
  availability: Partial<Record<Weekday, number>>;
  softConstraintFields: string[];
  feedback: { mapItemTitle: string; note: string; author: string }[];
  previousItems: Pick<MapItem, "kind" | "title" | "detail">[];
};
export type MapDraftItem = Omit<MapItem, "id">;
export type MapOutput = { items: MapDraftItem[] };

export const mapStage: Stage<MapInput, MapOutput> = {
  promptId: "map",
  effort: "high",
  schema: (t) =>
    z.object({
      items: z.array(
        z.object({
          kind: z.enum(t.map.outputs.map((o) => o.kind) as [string, ...string[]]),
          title: z.string(),
          detail: z.string(),
          sourceContributionIds: z.array(z.string()),
          minority: z.boolean(),
        }),
      ),
    }),
  render: (input, t) =>
    [
      json("template", { name: t.name, participantUnit: t.unitLabel.singular, mapOutputs: t.map.outputs }),
      json("group", { participants: input.participantCount, approvedProfiles: input.approvedCount }),
      json("shared_contributions", input.sharedContributions),
      json("ideas", input.ideas),
      json("anonymous_hard_constraints", input.constraints),
      json("availability_counts", input.availability),
      json("feedback_on_previous_map", input.feedback),
      json("previous_map", input.previousItems),
      "Build the group map.",
    ].join("\n\n"),
  mock: (input, t) => {
    const kinds = new Set(t.map.outputs.map((o) => o.kind));
    const items: MapDraftItem[] = [];
    const n = Math.max(input.approvedCount, 1);
    const unit = (k: number) => (k === 1 ? t.unitLabel.singular : t.unitLabel.plural);

    // Index values by field: value -> contributions mentioning it. Only list-like preference
    // fields; hard constraints are handled anonymously and numbers or free text don't cluster.
    const mappable = new Set(
      t.profileFields.filter((f) => (f.type === "list" || f.type === "multi") && f.constraint !== "hard").map((f) => f.key),
    );
    const label = (key: string) => t.profileFields.find((f) => f.key === key)?.label.toLowerCase() ?? key;
    const byField = new Map<string, Map<string, { label: string; contribs: SharedContribution[] }>>();
    for (const c of input.sharedContributions) {
      if (!c.field || !mappable.has(c.field)) continue;
      const m = byField.get(c.field) ?? new Map();
      for (const v of c.values) {
        const k = v.toLowerCase();
        const e = m.get(k) ?? { label: v, contribs: [] };
        e.contribs.push(c);
        m.set(k, e);
      }
      byField.set(c.field, m);
    }
    const soft = new Set(input.softConstraintFields);

    for (const [field, values] of byField) {
      if (soft.has(field)) continue;
      const label_ = label;
      for (const { label, contribs } of values.values()) {
        const authors = new Set(contribs.map((c) => c.author));
        if (authors.size >= 2 && kinds.has("agreement")) {
          items.push({
            kind: "agreement",
            title: label,
            detail: `${authors.size} of ${n} ${unit(n)} listed ${label} under ${label_(field)}: ${[...authors].join(", ")}.`,
            sourceContributionIds: contribs.map((c) => c.id),
            minority: false,
          });
        }
      }
      const singles = [...values.values()].filter((v) => new Set(v.contribs.map((c) => c.author)).size === 1);
      if (singles.length && kinds.has("minority")) {
        items.push({
          kind: "minority",
          title: `${label(field)[0].toUpperCase()}${label(field).slice(1)}: raised by one ${t.unitLabel.singular}`,
          detail: singles.map((s) => `${s.label} (${s.contribs[0].author})`).join(", "),
          sourceContributionIds: [...new Set(singles.flatMap((s) => s.contribs.map((c) => c.id)))],
          minority: true,
        });
      }
    }

    // Tensions: something one participant avoids that others list elsewhere.
    for (const field of soft) {
      const fieldLabel = label;
      for (const { label, contribs } of byField.get(field)?.values() ?? []) {
        for (const [otherField, values] of byField) {
          if (otherField === field) continue;
          const hit = values.get(label.toLowerCase());
          if (hit && kinds.has("tension")) {
            items.push({
              kind: "tension",
              title: `${label}: loved by some, avoided by others`,
              detail: `${contribs.map((c) => c.author).join(", ")} would rather avoid ${label}; ${hit.contribs.map((c) => c.author).join(", ")} listed it under ${fieldLabel(otherField)}.`,
              sourceContributionIds: [...contribs, ...hit.contribs].map((c) => c.id),
              minority: false,
            });
          }
        }
      }
    }

    // Pairings: a value one participant lists in one field, another lists in a different field.
    const pairs = new Set<string>();
    for (const [fa, va] of byField) {
      for (const [fb, vb] of byField) {
        if (fa === fb || soft.has(fa) || soft.has(fb)) continue;
        for (const [k, a] of va) {
          const b = vb.get(k);
          if (!b) continue;
          for (const ca of a.contribs) {
            for (const cb of b.contribs) {
              if (ca.author === cb.author) continue;
              const key = [ca.id, cb.id].sort().join("|");
              if (pairs.has(key) || !kinds.has("pairing")) continue;
              pairs.add(key);
              items.push({
                kind: "pairing",
                title: `${ca.author} and ${cb.author}: ${a.label}`,
                detail: `${ca.author} listed ${a.label} under ${label(fa)}; ${cb.author} listed it under ${label(fb)}.`,
                sourceContributionIds: [ca.id, cb.id],
                minority: false,
              });
            }
          }
        }
      }
    }

    if (input.constraints.length && kinds.has("constraint")) {
      items.push({
        kind: "constraint",
        title: "Every meal must respect",
        detail: input.constraints.join("; "),
        sourceContributionIds: [],
        minority: false,
      });
    }

    const days = Object.entries(input.availability).sort((a, b) => b[1] - a[1]);
    if (days.length && kinds.has("schedule")) {
      const [day, count] = days[0];
      items.push({
        kind: "schedule",
        title: `${day} suits the most ${t.unitLabel.plural}`,
        detail: days.map(([d, c]) => `${d}: ${c} of ${n}`).join(", ") + `. Best: ${day} (${count} of ${n}).`,
        sourceContributionIds: [],
        minority: false,
      });
    }

    for (const idea of input.ideas) {
      items.push({
        kind: kinds.has("minority") ? "minority" : t.map.outputs[0].kind,
        title: `Idea from ${idea.author}`,
        detail: idea.text,
        sourceContributionIds: [idea.id],
        minority: true,
      });
    }

    return { items };
  },
};

// =============================================================================================
// Proposals: draft options, and revise after objections
// =============================================================================================

export type ProposalDraft = {
  title: string;
  summary: string;
  tradeoffs: string[];
  weekday: Weekday;
  cadence: "weekly" | "fortnightly" | "monthly";
  startDate: string;
  occurrences: number;
  time: string;
  themes: string[];
  parts: string[];
  sourceContributionIds: string[];
  mapItemIds: string[];
};

export type ProposalContext = {
  earliestStart: string;
  timezone: string;
  participantCount: number;
  map: Pick<MapItem, "id" | "kind" | "title" | "detail" | "sourceContributionIds">[];
  constraints: string[];
  availability: Partial<Record<Weekday, number>>;
  sharedContributions: SharedContribution[];
  ideas: SharedContribution[];
};

const proposalDraftSchema = (t: Template) =>
  z.object({
    title: z.string(),
    summary: z.string(),
    tradeoffs: z.array(z.string()),
    weekday: z.enum(WEEKDAYS),
    cadence: z.enum(t.proposal.cadences as [string, ...string[]]),
    startDate: z.string().describe("YYYY-MM-DD, on the chosen weekday, not before earliestStart"),
    occurrences: z.number().int(),
    time: z.string().describe("HH:MM, 24-hour"),
    themes: z.array(z.string()),
    parts: z.array(z.string()),
    sourceContributionIds: z.array(z.string()),
    mapItemIds: z.array(z.string()),
  }) as unknown as z.ZodType<ProposalDraft>;

function proposalBrief(t: Template) {
  return {
    name: t.name,
    proposalLabel: t.proposal.label,
    guidance: t.proposal.guidance,
    defaultParts: t.proposal.parts,
    themeField: t.proposal.themeField,
    cadences: t.proposal.cadences,
    maxOccurrences: t.proposal.maxOccurrences,
    eventNoun: t.act.eventNoun,
    taskNoun: t.act.taskNoun,
    defaultTime: t.act.defaultTime,
    location: t.act.location,
  };
}

function renderContext(input: ProposalContext) {
  return [
    json("group", { participants: input.participantCount, earliestStart: input.earliestStart, timezone: input.timezone }),
    json("map", input.map),
    json("hard_constraints", input.constraints),
    json("availability_counts", input.availability),
    json("shared_contributions", input.sharedContributions),
    json("ideas", input.ideas),
  ];
}

function rankedDays(availability: ProposalContext["availability"]): Weekday[] {
  const days = WEEKDAYS.filter((d) => (availability[d] ?? 0) > 0).sort(
    (a, b) => (availability[b] ?? 0) - (availability[a] ?? 0),
  );
  return days.length ? days : ["Thu"];
}

function popularValues(input: ProposalContext, t: Template): string[] {
  const key = t.proposal.themeField;
  if (!key) return [];
  const counts = new Map<string, { label: string; n: number }>();
  for (const c of input.sharedContributions.filter((x) => x.field === key)) {
    for (const v of c.values) {
      const e = counts.get(v.toLowerCase()) ?? { label: v, n: 0 };
      e.n++;
      counts.set(v.toLowerCase(), e);
    }
  }
  return [...counts.values()].filter((v) => v.n >= 2).sort((a, b) => b.n - a.n).map((v) => v.label);
}

function mockOption(
  input: ProposalContext,
  t: Template,
  weekday: Weekday,
  cadence: ProposalDraft["cadence"],
  occurrences: number,
): ProposalDraft {
  const themes = popularValues(input, t).slice(0, occurrences);
  const count = input.availability[weekday] ?? 0;
  const agreement = input.map.filter((m) => m.kind === "agreement" || m.kind === "schedule");
  const every = cadence === "weekly" ? "Every" : cadence === "fortnightly" ? "Every second" : "One";
  return {
    title: `${cadence[0].toUpperCase()}${cadence.slice(1)} ${weekday} ${t.act.eventNoun}s`,
    summary: `${every} ${weekday}${cadence === "monthly" ? " a month" : ""}, ${occurrences} times to start, at ${t.act.location}. ${
      themes.length ? `Themes rotate through ${themes.join(", ")}.` : "Each cook picks the theme."
    }`,
    tradeoffs: [
      `${weekday} suits ${count} of ${input.participantCount} ${t.unitLabel.plural}.`,
      cadence === "monthly"
        ? "Lighter commitment, but slower to build a habit."
        : cadence === "weekly"
          ? "Builds momentum fast, but is the heaviest commitment."
          : "A balance between momentum and load.",
    ],
    weekday,
    cadence,
    startDate: input.earliestStart,
    occurrences,
    time: t.act.defaultTime,
    themes,
    parts: t.proposal.parts,
    sourceContributionIds: [],
    mapItemIds: agreement.map((m) => m.id),
  };
}

export type ProposalsOutput = { options: ProposalDraft[] };

export const proposalsStage: Stage<ProposalContext, ProposalsOutput> = {
  promptId: "proposals",
  effort: "high",
  schema: (t) => z.object({ options: z.array(proposalDraftSchema(t)) }),
  render: (input, t) =>
    [json("template", proposalBrief(t)), ...renderContext(input), "Draft two or three options."].join("\n\n"),
  mock: (input, t) => {
    const days = rankedDays(input.availability);
    const cad = t.proposal.cadences;
    const pick = (c: ProposalDraft["cadence"]) => (cad.includes(c) ? c : cad[0]);
    const options = [
      mockOption(input, t, days[0], pick("fortnightly"), 4),
      mockOption(input, t, days[0], pick("monthly"), 3),
    ];
    if (days[1]) options.push(mockOption(input, t, days[1], pick("fortnightly"), 4));
    return { options };
  },
};

export type ReviseInput = ProposalContext & {
  proposal: ProposalDraft;
  responses: { support: number; liveWith: number };
  objections: { contributionId: string; author: string; reason: string }[];
};
export type ReviseOutput = { option: ProposalDraft; changeNote: string };

export const reviseStage: Stage<ReviseInput, ReviseOutput> = {
  promptId: "revise",
  effort: "high",
  schema: (t) => z.object({ option: proposalDraftSchema(t), changeNote: z.string() }),
  render: (input, t) =>
    [
      json("template", proposalBrief(t)),
      ...renderContext(input),
      json("proposal", input.proposal),
      json("responses", input.responses),
      json("objections", input.objections),
      "Revise the proposal to resolve the objections.",
    ].join("\n\n"),
  mock: (input, t) => {
    const p = { ...input.proposal };
    const text = input.objections.map((o) => o.reason).join(" ");
    const named = parseWeekdays(text).filter((d) => d !== p.weekday);
    const notes: string[] = [];
    if (named.length) {
      p.weekday = named[0];
      notes.push(`moved to ${named[0]}`);
    } else if (/often|too much|busy|frequent/i.test(text) && t.proposal.cadences.includes("monthly") && p.cadence !== "monthly") {
      p.cadence = "monthly";
      notes.push("made it monthly");
    } else {
      const next = rankedDays(input.availability).find((d) => d !== p.weekday);
      if (next) {
        p.weekday = next;
        notes.push(`moved to ${next}, the next best night`);
      }
    }
    p.sourceContributionIds = [...new Set([...p.sourceContributionIds, ...input.objections.map((o) => o.contributionId)])];
    p.tradeoffs = [...p.tradeoffs, `Revised after ${input.objections.length} objection(s): ${notes.join(", ") || "clarified"}.`];
    return { option: p, changeNote: `In response to objections, this version ${notes.join(" and ") || "clarifies the plan"}.` };
  },
};
