import { z } from "zod";
import { eq } from "drizzle-orm";
import { defineTool } from "./define";
import { audit, requireMember, ToolError, type ToolContext } from "../context";
import { intakeSessions, profileRevisions, profiles, type TranscriptMessage } from "../db/schema";
import { intakeOpening, intakeTurn, profileDraft } from "../agent/stages";
import { fieldsWithDefaults } from "../values";
import { newId } from "../ids";
import type { Member } from "../context";

async function loadOrStart(ctx: ToolContext, m: Member) {
  const [row] = await ctx.db.select().from(intakeSessions).where(eq(intakeSessions.participantId, m.me.id));
  if (row) return row;
  const opening: TranscriptMessage = { role: "agent", text: intakeOpening(m.template), at: ctx.now.toISOString() };
  const [created] = await ctx.db
    .insert(intakeSessions)
    .values({ participantId: m.me.id, messages: [opening], topicsCovered: [], status: "in_progress" })
    .returning();
  return created;
}

function view(row: typeof intakeSessions.$inferSelect, m: Member) {
  return {
    messages: row.messages,
    topicsCovered: row.topicsCovered,
    totalTopics: m.template.intake.topics.length,
    status: row.status,
    canDraft: row.messages.some((x) => x.role === "participant"),
  };
}

export const getIntake = defineTool({
  name: "get_intake",
  description: "Get (or start) the caller's intake conversation. Resumes where they left off.",
  layer: "personal",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const m = await requireMember(ctx, spaceId);
    return view(await loadOrStart(ctx, m), m);
  },
});

export const sendIntakeMessage = defineTool({
  name: "send_intake_message",
  description: "Send the caller's answer in the intake conversation and get the agent's next message.",
  layer: "personal",
  input: z.object({ spaceId: z.string(), text: z.string().trim().min(1).max(4000) }),
  run: async (ctx, { spaceId, text }) => {
    const m = await requireMember(ctx, spaceId);
    const row = await loadOrStart(ctx, m);
    const messages: TranscriptMessage[] = [...row.messages, { role: "participant", text, at: ctx.now.toISOString() }];
    const { output } = await ctx.agent.run(intakeTurn, {
      spaceId,
      template: m.template,
      input: { displayName: m.me.displayName, transcript: messages, topicsCovered: row.topicsCovered },
    });
    messages.push({ role: "agent", text: output.reply, at: new Date().toISOString() });
    const topics = [...new Set([...row.topicsCovered, ...output.topicsCovered])];
    const status = output.readyToDraft ? "ready" : row.status === "drafted" ? "drafted" : "in_progress";
    const [updated] = await ctx.db
      .update(intakeSessions)
      .set({ messages, topicsCovered: topics, status, updatedAt: ctx.now })
      .where(eq(intakeSessions.participantId, m.me.id))
      .returning();
    return view(updated, m);
  },
});

export const draftMyProfile = defineTool({
  name: "draft_my_profile",
  description:
    "Ask the agent to draft the caller's profile from their intake conversation. The draft is private until the caller approves it.",
  layer: "personal",
  input: z.object({ spaceId: z.string() }),
  run: async (ctx, { spaceId }) => {
    const m = await requireMember(ctx, spaceId);
    const row = await loadOrStart(ctx, m);
    if (!row.messages.some((x) => x.role === "participant")) throw new ToolError("Answer at least one question first.");
    const { output } = await ctx.agent.run(profileDraft, {
      spaceId,
      template: m.template,
      input: { displayName: m.me.displayName, transcript: row.messages },
    });

    const [existing] = await ctx.db.select().from(profiles).where(eq(profiles.participantId, m.me.id));
    const drafted = fieldsWithDefaults(m.template, output.fields);
    // Keep any visibility choices the participant already made.
    if (existing) for (const k of Object.keys(drafted)) if (existing.fields[k]) drafted[k].visibility = existing.fields[k].visibility;

    const version = (existing?.version ?? 0) + 1;
    const profileId = existing?.id ?? newId();
    if (existing) {
      await ctx.db
        .update(profiles)
        .set({ fields: drafted, summary: output.summary, status: "draft", version, updatedAt: ctx.now })
        .where(eq(profiles.id, existing.id));
    } else {
      await ctx.db.insert(profiles).values({
        id: profileId,
        participantId: m.me.id,
        spaceId,
        fields: drafted,
        summary: output.summary,
        status: "draft",
        version,
      });
    }
    await ctx.db.insert(profileRevisions).values({
      id: newId(),
      profileId,
      version,
      fields: drafted,
      summary: output.summary,
      editedBy: "agent",
    });
    await ctx.db.update(intakeSessions).set({ status: "drafted" }).where(eq(intakeSessions.participantId, m.me.id));
    await audit(ctx, { spaceId, actorType: "agent", actorId: m.me.id, action: "profile.drafted", detail: { version } });
    return { profileId, version };
  },
});
