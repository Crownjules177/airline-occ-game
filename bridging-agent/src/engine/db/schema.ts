import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { Visibility } from "../template";

/**
 * The seven core entities (Space, Participant, Profile, Contribution, Proposal, Commitment,
 * Connection) plus what they need to work: accounts and sessions for magic-link login, intake
 * transcripts, maps, plans and events, and the audit log.
 */

const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---- Identity -------------------------------------------------------------------------------

/** A login. For the meal pilot one account = one household. */
export const accounts = pgTable("accounts", {
  id: id(),
  email: text("email").unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  /** email: single use, short-lived. personal: reusable link the participant keeps (and can rotate). */
  kind: text("kind").$type<"email" | "personal">().notNull().default("email"),
  redirectTo: text("redirect_to"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---- Space and participants -----------------------------------------------------------------

export type SpaceStage = "intake" | "map" | "agree" | "act" | "sustain";
export type SpaceSettings = {
  mapThresholdPercent: number;
  timezone: string;
  location: string;
};

export const spaces = pgTable("spaces", {
  id: id(),
  name: text("name").notNull(),
  templateId: text("template_id").notNull(),
  hostAccountId: text("host_account_id").notNull().references(() => accounts.id),
  inviteCode: text("invite_code").notNull().unique(),
  stage: text("stage").$type<SpaceStage>().notNull().default("intake"),
  settings: jsonb("settings").$type<SpaceSettings>().notNull(),
  createdAt: createdAt(),
});

export type Consent = { dataUse: boolean; agreedAt: string };

export const participants = pgTable(
  "participants",
  {
    id: id(),
    spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    role: text("role").$type<"host" | "participant">().notNull(),
    unit: text("unit").$type<"household" | "individual">().notNull(),
    displayName: text("display_name").notNull(),
    channel: text("channel").$type<"whatsapp" | "email">().notNull().default("whatsapp"),
    consent: jsonb("consent").$type<Consent>().notNull(),
    /** Secret for the read-only calendar feed, so calendars can subscribe without a login. */
    calendarToken: text("calendar_token").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("participants_space_account").on(t.spaceId, t.accountId)],
);

// ---- Intake and profiles --------------------------------------------------------------------

export type TranscriptMessage = { role: "agent" | "participant"; text: string; at: string };

export const intakeSessions = pgTable("intake_sessions", {
  participantId: text("participant_id")
    .primaryKey()
    .references(() => participants.id, { onDelete: "cascade" }),
  messages: jsonb("messages").$type<TranscriptMessage[]>().notNull(),
  topicsCovered: jsonb("topics_covered").$type<string[]>().notNull().default([]),
  status: text("status").$type<"in_progress" | "ready" | "drafted">().notNull().default("in_progress"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FieldValue = string | number | string[] | null;
export type ProfileFields = Record<string, { value: FieldValue; visibility: Visibility }>;

export const profiles = pgTable("profiles", {
  id: id(),
  participantId: text("participant_id")
    .notNull()
    .unique()
    .references(() => participants.id, { onDelete: "cascade" }),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  fields: jsonb("fields").$type<ProfileFields>().notNull(),
  summary: text("summary").notNull(),
  status: text("status").$type<"draft" | "approved">().notNull().default("draft"),
  version: integer("version").notNull().default(1),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Edit history: every agent draft and participant edit, so profile accuracy can be measured. */
export const profileRevisions = pgTable("profile_revisions", {
  id: id(),
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  fields: jsonb("fields").$type<ProfileFields>().notNull(),
  summary: text("summary").notNull(),
  editedBy: text("edited_by").$type<"agent" | "participant">().notNull(),
  createdAt: createdAt(),
});

// ---- Contributions --------------------------------------------------------------------------

export type ContributionKind = "idea" | "comment" | "profile_field" | "map_feedback" | "objection" | "feedback";

/** Any idea, comment, feedback or shared profile answer, with its author: the unit of provenance. */
export const contributions = pgTable(
  "contributions",
  {
    id: id(),
    spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    participantId: text("participant_id").references(() => participants.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ContributionKind>().notNull(),
    body: text("body").notNull(),
    fieldKey: text("field_key"),
    /** What the contribution is about, e.g. a map item or proposal. */
    refType: text("ref_type"),
    refId: text("ref_id"),
    visibility: text("visibility").$type<Visibility>().notNull().default("group"),
    createdAt: createdAt(),
  },
  (t) => [index("contributions_space").on(t.spaceId)],
);

// ---- Map ------------------------------------------------------------------------------------

export type MapItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  sourceContributionIds: string[];
  minority: boolean;
};

export const maps = pgTable("maps", {
  id: id(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  items: jsonb("items").$type<MapItem[]>().notNull(),
  /** Anonymous hard constraints every proposal must respect. Never attributed. */
  constraints: jsonb("constraints").$type<string[]>().notNull(),
  current: boolean("current").notNull().default(true),
  agentCallId: text("agent_call_id"),
  createdAt: createdAt(),
});

// ---- Proposals and plans --------------------------------------------------------------------

export type Cadence = "weekly" | "fortnightly" | "monthly";
export type Schedule = {
  weekday: string;
  cadence: Cadence;
  startDate: string; // YYYY-MM-DD, local to the space
  occurrences: number;
  time: string; // HH:MM
};

export type ProposalStatus = "draft" | "open" | "agreed" | "dropped" | "superseded";

export const proposals = pgTable("proposals", {
  id: id(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  roundId: text("round_id").notNull(),
  version: integer("version").notNull().default(1),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  tradeoffs: jsonb("tradeoffs").$type<string[]>().notNull(),
  schedule: jsonb("schedule").$type<Schedule>().notNull(),
  themes: jsonb("themes").$type<string[]>().notNull(),
  parts: jsonb("parts").$type<string[]>().notNull(),
  constraints: jsonb("constraints").$type<string[]>().notNull(),
  sourceContributionIds: jsonb("source_contribution_ids").$type<string[]>().notNull(),
  mapItemIds: jsonb("map_item_ids").$type<string[]>().notNull(),
  status: text("status").$type<ProposalStatus>().notNull().default("draft"),
  hostEdited: boolean("host_edited").notNull().default(false),
  agentCallId: text("agent_call_id"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export type Signal = "support" | "live_with" | "object";

export const proposalResponses = pgTable(
  "proposal_responses",
  {
    id: id(),
    proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    signal: text("signal").$type<Signal>().notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("responses_proposal_participant").on(t.proposalId, t.participantId)],
);

export const plans = pgTable("plans", {
  id: id(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  proposalId: text("proposal_id").notNull().references(() => proposals.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  constraints: jsonb("constraints").$type<string[]>().notNull(),
  current: boolean("current").notNull().default(true),
  createdAt: createdAt(),
});

export const events = pgTable("events", {
  id: id(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  theme: text("theme"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  location: text("location").notNull(),
});

export type CommitmentStatus = "open" | "claimed" | "done" | "missed";

/** A task someone claims: for the pilot, one part of one shared meal. */
export const commitments = pgTable("commitments", {
  id: id(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  part: text("part").notNull(),
  participantId: text("participant_id").references(() => participants.id, { onDelete: "set null" }),
  status: text("status").$type<CommitmentStatus>().notNull().default("open"),
  /** Bumped on every change so calendar clients replace the invite. */
  sequence: integer("sequence").notNull().default(0),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
});

// ---- Bridging (phase 3; entity present so the model is complete) ---------------------------

export const connections = pgTable("connections", {
  id: id(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  participantIds: jsonb("participant_ids").$type<string[]>().notNull(),
  reason: text("reason").notNull(),
  sourceContributionIds: jsonb("source_contribution_ids").$type<string[]>().notNull(),
  responses: jsonb("responses").$type<Record<string, "accepted" | "declined">>().notNull().default({}),
  status: text("status").$type<"suggested" | "accepted" | "declined">().notNull().default("suggested"),
  outcome: text("outcome"),
  createdAt: createdAt(),
});

// ---- Audit ----------------------------------------------------------------------------------

/** Every agent call, with the prompt version, inputs and outputs (audit rule, NFR5). */
export const agentCalls = pgTable("agent_calls", {
  id: id(),
  spaceId: text("space_id").references(() => spaces.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  promptId: text("prompt_id").notNull(),
  promptVersion: integer("prompt_version").notNull(),
  model: text("model").notNull(),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  error: text("error"),
  usage: jsonb("usage"),
  durationMs: integer("duration_ms").notNull(),
  createdAt: createdAt(),
});

export const auditEvents = pgTable("audit_events", {
  id: id(),
  spaceId: text("space_id").references(() => spaces.id, { onDelete: "cascade" }),
  actorType: text("actor_type").$type<"agent" | "participant" | "host" | "system">().notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: createdAt(),
});

export type Account = typeof accounts.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;
export type MapRow = typeof maps.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type ProposalResponse = typeof proposalResponses.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
