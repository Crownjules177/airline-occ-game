# The Bridging Agent standard (draft 0.1)

Licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The code that implements it is Apache 2.0.

This document describes the method, data model and templates so that other implementations, and participants' own agents, can take part in a bridging space without depending on this codebase. The skill in `skill/bridging-method/SKILL.md` is the same method written for agents.

## 1. Roles

| Role | Can do |
| --- | --- |
| Host | Create a space, pick a template, invite people, release proposals to the group, record agreement, override stages, read the audit log. |
| Participant | Complete intake, view and edit their own profile, see the map, respond to proposals, claim tasks, give feedback, export or delete their data. A participant is a household or an individual, as the template says. |
| Bridging agent | Run intake, draft profiles, build the map, draft and revise proposals, suggest assignments and connections. Never decides, never shares one person's private input with another, never messages people outside the host's configured channels. |

## 2. Data model

| Entity | Holds |
| --- | --- |
| Space | Name, template, host, invite code, stage, settings (map threshold, timezone, location). |
| Participant | Person or household in a space; role; consent record; calendar feed token. |
| Profile | Structured fields, each `{value, visibility}`; summary; status (`draft`, `approved`); version; full edit history. |
| Contribution | Any idea, comment, objection, map feedback, or shared profile answer; author; visibility. The unit of provenance. |
| Map | Versioned list of items `{kind, title, detail, sourceContributionIds, minority}` plus anonymous hard constraints. |
| Proposal | Title, summary, trade-offs, schedule, themes, parts, constraints, source contributions and map items; status (`draft`, `open`, `agreed`, `dropped`, `superseded`); version and parent. |
| Plan, Event, Commitment | The agreed plan (versioned), its dated events, and the tasks people claim. |
| Connection | A suggested link between participants, the reason, the source contributions, each side's response. |
| Agent call, Audit event | Every agent call with prompt id and version, model, input and output; every action taken. |

**Provenance rule.** Map items, proposals and connections store the ids of the contributions they came from.

**Audit rule.** Every agent action is logged with its inputs and outputs and is visible to the host.

## 3. Visibility

Each profile field has one of three visibilities, defaulted by the template and changeable by the participant:

| Visibility | Owner | Host | Other participants | Agent |
| --- | --- | --- | --- | --- |
| `group` | yes | yes | yes, once approved | yes |
| `host` | yes | yes, once approved | no | yes, but never attributed in group output |
| `agent` | yes | no | no | yes, only as anonymous aggregates or constraints |

Implementations must enforce this on the server, independent of any prompt: reads are filtered by viewer; only `group` fields become citable contributions; hard constraints are aggregated without names; and agent output that places a participant's name next to one of their non-group values is rejected.

## 4. Stages

Intake → Map → Agree → Act → Sustain, with Bridge running across the later stages and Sustain looping back to the Map as preferences change. See the skill for what each stage does and the rules the agent follows in it.

Agreement signals are `support`, `live_with` and `object` (with a reason). A proposal with an outstanding objection cannot be recorded as agreed; it is revised instead.

## 5. Templates

A template is a JSON document validated against `TemplateSchema` (`src/engine/template.ts`). It defines:

- the participant unit and labels, group size and timezone;
- stages (label, description, enabled);
- intake topics, each mapped to profile fields;
- profile fields: key, label, description, type (`text`, `list`, `choice`, `multi`, `number`, `weekdays`), options, default visibility, and whether the field is a `hard` or `soft` constraint;
- map output kinds and the approval threshold;
- proposal guidance, default parts, cadences, maximum occurrences, and which fields carry availability, themes and preferred parts;
- event and task nouns, default time, duration and location;
- sustain cadence and channels.

Two templates ship: `community-meals` (ready) and `coalition` (draft, to be remapped to the coalition's facilitation framework).

## 6. Tools

The engine's boundary is a set of named tools with JSON input schemas, in three layers: personal, group and host. `GET /api/tools` returns the catalogue in an MCP-compatible shape. A federated personal agent calls personal-layer tools as its participant; group-layer work always stays with one steward agent per group.

## 7. Calendars

Every claimed task is an iCalendar event (RFC 5545) with a stable UID and an increasing SEQUENCE. Each participant has a private feed URL; tasks from superseded plans remain in the feed as `CANCELLED` so calendars remove them.
