import { z } from "zod";
import communityMeals from "../../templates/community-meals.json";
import coalition from "../../templates/coalition.json";

/**
 * A template holds everything domain-specific (principle 7). The engine reads it; it never
 * branches on a template id.
 */

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const VISIBILITIES = ["group", "host", "agent"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const STAGE_IDS = ["intake", "map", "agree", "act", "sustain", "bridge"] as const;
export type StageId = (typeof STAGE_IDS)[number];

const FieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string(),
    description: z.string(),
    type: z.enum(["text", "list", "choice", "multi", "number", "weekdays"]),
    options: z.array(z.string()).optional(),
    defaultVisibility: z.enum(VISIBILITIES),
    /** hard: enforced in every proposal, surfaced only as anonymous constraints. soft: a preference. */
    constraint: z.enum(["hard", "soft"]).optional(),
    /** Placeholder shown when the participant edits the field. */
    example: z.string().optional(),
  })
  .refine((f) => !["choice", "multi"].includes(f.type) || (f.options?.length ?? 0) > 0, {
    message: "choice and multi fields need options",
  });

export const TemplateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    status: z.enum(["ready", "draft"]),
    description: z.string(),
    participantUnit: z.enum(["household", "individual"]),
    unitLabel: z.object({ singular: z.string(), plural: z.string() }),
    groupSize: z.object({ min: z.number().int(), max: z.number().int() }),
    timezone: z.string(),
    stages: z
      .array(
        z.object({
          id: z.enum(STAGE_IDS),
          label: z.string(),
          enabled: z.boolean(),
          description: z.string(),
        }),
      )
      .min(1),
    intake: z.object({
      intro: z.string(),
      targetMinutes: z.number().int().positive(),
      topics: z
        .array(
          z.object({
            id: z.string(),
            question: z.string(),
            fieldKeys: z.array(z.string()).min(1),
          }),
        )
        .min(1),
    }),
    profileFields: z.array(FieldSchema).min(1),
    map: z.object({
      thresholdPercent: z.number().min(1).max(100),
      outputs: z.array(z.object({ kind: z.string(), label: z.string(), description: z.string() })).min(1),
    }),
    proposal: z.object({
      label: z.string(),
      guidance: z.string(),
      parts: z.array(z.string()).min(1),
      cadences: z.array(z.enum(["weekly", "fortnightly", "monthly"])).min(1),
      maxOccurrences: z.number().int().positive(),
      /** Field whose weekday values describe availability; used to aggregate schedule overlap. */
      availabilityField: z.string().optional(),
      /** Field whose shared values make good themes (e.g. cuisines). */
      themeField: z.string().optional(),
      /** Field whose values say which parts a participant enjoys; used to suggest assignments. */
      partsField: z.string().optional(),
    }),
    act: z.object({
      eventNoun: z.string(),
      taskNoun: z.string(),
      defaultTime: z.string().regex(/^\d{2}:\d{2}$/),
      durationMinutes: z.number().int().positive(),
      location: z.string(),
    }),
    sustain: z.object({ cadence: z.enum(["per_event", "weekly_digest"]) }),
    channels: z.array(z.enum(["web", "whatsapp_link", "email"])).min(1),
  })
  .superRefine((t, ctx) => {
    const keys = new Set(t.profileFields.map((f) => f.key));
    if (keys.size !== t.profileFields.length) ctx.addIssue({ code: "custom", message: "duplicate field keys" });
    for (const topic of t.intake.topics) {
      for (const k of topic.fieldKeys) {
        if (!keys.has(k)) ctx.addIssue({ code: "custom", message: `topic ${topic.id} references unknown field ${k}` });
      }
    }
    for (const k of [t.proposal.availabilityField, t.proposal.partsField, t.proposal.themeField]) {
      if (k && !keys.has(k)) ctx.addIssue({ code: "custom", message: `proposal references unknown field ${k}` });
    }
  });

export type Template = z.infer<typeof TemplateSchema>;
export type ProfileField = Template["profileFields"][number];

const registry = new Map<string, Template>();
for (const raw of [communityMeals, coalition]) {
  const t = TemplateSchema.parse(raw);
  registry.set(t.id, t);
}

export function getTemplate(id: string): Template {
  const t = registry.get(id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}

export function listTemplates(): Template[] {
  return [...registry.values()];
}

export function stageLabel(t: Template, id: StageId): string {
  return t.stages.find((s) => s.id === id)?.label ?? id;
}
