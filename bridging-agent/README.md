# Bridging Agent

An AI that helps a group surface what each person wants and can offer, find where they agree, form small teams, and keep momentum, so that no one person ends up doing all the organising.

The first template is a **community meal share**: five or more households in one building split the parts of a shared meal. The same engine, with a different template, is meant to run the **Coalition of Consequence** (about 40 people forming shared perspectives and working groups).

**Humans decide, the agent bridges.** It proposes, connects and nudges; people make every decision.

## Status

This is the Phase 1 MVP from the requirements: enough to run the first meal cycle end to end.

| Requirement area | Built |
| --- | --- |
| Space setup, invites via WhatsApp share links | ✓ |
| Magic-link login, no app install | ✓ Personal sign-in links (shared to yourself on WhatsApp). Emailed links once `RESEND_API_KEY` is set. |
| Intake chat (typed or dictated, pause and resume) | ✓ |
| Agent-drafted profile; review, edit, per-field visibility, approve | ✓ with full edit history |
| Group map with provenance and minority views; flag and revise | ✓ |
| Proposals: draft, host edit and release, support / can live with it / object, revision on objection, versioned plan | ✓ |
| Tasks, claiming, suggested assignments, calendar view | ✓ |
| Calendar invites (.ics) and a subscribable per-person feed | ✓ |
| Host audit log (every agent prompt version, input and output) | ✓ |
| Export and delete my data | ✓ |
| Coalition template | Draft; waiting on Andy's framework |
| Phase 2+: reminders with one-tap replies, feedback, weekly summary, swaps, drift flags, connections | Not yet. The data model already has the entities (e.g. `connections`). |

## Try it

```bash
cd bridging-agent
npm install
npm run seed        # optional: a demo space with five households who have finished intake
npm run dev         # http://localhost:3000
```

No configuration is needed locally. Without `DATABASE_URL` the app uses an embedded Postgres (PGlite) stored in `./.data`. Without `ANTHROPIC_API_KEY` it uses a **deterministic mock agent**, so the whole flow works offline and costs nothing. `npm run seed` prints a sign-in link for each demo household. Open the host's link, go to **Map**, and draw the map.

To use Claude, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.

```bash
npm test            # end-to-end meal cycle, visibility rules, schedule, .ics, templates
npm run typecheck
```

## Deploying the pilot

Step-by-step: [`docs/deploy.md`](docs/deploy.md).

- **Database:** Postgres in an Australian region (NFR3), e.g. Supabase in `ap-southeast-2` (Sydney). Set `DATABASE_URL`; migrations in `drizzle/` run on first request.
- **App:** Vercel or any Node host. Set `APP_URL` to the public URL, plus `ANTHROPIC_API_KEY` and `BRIDGING_MODEL`. PGlite is for local use only; serverless hosts need `DATABASE_URL`.
- **Email (phase 2):** set `RESEND_API_KEY` and `EMAIL_FROM` to send magic links by email.
- **Cost (NFR7):** every agent call goes through one service layer (`src/engine/agent/service.ts`), and `BRIDGING_MODEL` switches the model for all of them. It defaults to `claude-opus-5`. Intake turns run at low effort; the map and proposals at high effort. The stable prompts are cached. A meal cycle for 5 to 10 households is a few dozen calls. Set `BRIDGING_MODEL=claude-sonnet-5` for a cheaper run and compare the audit log output.

## How it's built

```
templates/            Domain specifics, as JSON (community-meals, coalition)
prompts/              One versioned prompt per agent stage (intake, profile, map, proposals, revise)
skill/bridging-method The method as an Agent Skill (SKILL.md)
docs/standard.md      The method, data model and templates as a written standard (CC BY 4.0)
drizzle/              SQL migrations
src/engine/           The engine: no UI, no framework
  tools/              Named tools with typed inputs, the MCP-shaped boundary
  agent/              Agent service layer, stage definitions, Claude client, mock
  db/                 Schema (7 core entities + auth, maps, plans, audit)
  visibility.ts       Who sees which profile field, enforced on every read
  group.ts            Group state, privacy guard, provenance sync
  assign.ts           Load-balancing task suggestions
  schedule.ts, ics.ts Dates in the space's timezone; RFC 5545 output
src/app/              Next.js mobile-first web app. Reads call tools in-process;
                      writes go through POST /api/tools/<name>
```

**Tool-shaped boundary.** The web app talks to the engine only through named tools (`src/engine/tools`), each with a Zod input schema and a layer (`personal`, `group`, `host`). `GET /api/tools` lists them with JSON Schemas. Exposing the personal layer as an MCP server later means wrapping these, not redesigning them.

**Every agent call** goes through `AgentService.run`. It loads the stage's versioned prompt, asks Claude for structured output validated against a schema derived from the template, and logs the prompt id and version, model, input, output, usage and errors to `agent_calls`. The host sees all of it in the audit log.

### How the principles are enforced

| Principle | Where |
| --- | --- |
| Humans decide | The agent only drafts. The host releases proposals and records agreement; participants claim tasks. `adopt_proposal` refuses while any objection stands. |
| Transparent representation | Profiles are private drafts until approved; every field is editable; full revision history. |
| Preserve difference | Map prompt and schema include `minority` items; the mock and the prompt keep single-household views as their own items. |
| Provenance | Only group-visible, approved profile answers and ideas become citable contributions. Map and proposal citations are filtered to real ids on the server. Revisions always cite the objections they answer. |
| Privacy (visibility) | `visibility.ts` filters every read. Hard constraints are aggregated without names. `leaksPrivate()` drops agent output that places a name next to that person's private value. Hosts can't issue sign-in links for others, so they can't sign in as a participant. |
| Hard constraints | Attached to every proposal from the data, not the model. Themes that break a constraint are replaced on the server. |
| Minimal data, export, delete | `export_my_data`, `delete_my_data`. Contact email is optional. |
| Channel-agnostic | `notify.ts` adapters: WhatsApp share links now, email via Resend, more later. |
| Template-driven | Everything domain-specific is in `templates/*.json`, validated at startup. |

## Licence

Code: Apache 2.0 (`LICENSE`). Method, standard and templates: CC BY 4.0.
