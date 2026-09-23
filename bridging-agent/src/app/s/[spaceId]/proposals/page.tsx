import { call } from "../../../lib/server";
import { ToolButton } from "../../../components/tool";
import { Respond } from "./respond";
import { EditProposal } from "./edit";

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft: only you can see it", tone: "warn" },
  open: { label: "Open for responses", tone: "accent" },
  agreed: { label: "Agreed", tone: "good" },
  dropped: { label: "Dropped", tone: "" },
  superseded: { label: "Replaced by a revision", tone: "" },
};

function when(s: any) {
  const every = s.cadence === "weekly" ? "Every" : s.cadence === "fortnightly" ? "Every second" : "Once a month on a";
  const start = new Date(`${s.startDate}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${every} ${s.weekday} at ${s.time}, ${s.occurrences} times, from ${start}`;
}

export default async function Proposals({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const [space, data, map] = await Promise.all([
    call("get_space", { spaceId }),
    call("list_proposals", { spaceId }),
    call("get_map", { spaceId }),
  ]);
  const isHost = space.me.isHost;
  const active = data.proposals.filter((p: any) => ["draft", "open", "agreed"].includes(p.status));
  const past = data.proposals.filter((p: any) => !["draft", "open", "agreed"].includes(p.status));

  return (
    <>
      {isHost && (
        <div className="card stack">
          <p className="small">
            The agent drafts options from the map. You review and edit them, then release them to the group. Objections lead
            to a revision rather than being outvoted.
          </p>
          {map.map ? (
            <ToolButton tool="draft_proposals" input={{ spaceId }} className={active.length ? "" : "primary"} busyLabel="Drafting options…">
              {active.length ? "Draft a fresh set of options" : "Draft options from the map"}
            </ToolButton>
          ) : (
            <p className="notice small">Draw the group map first.</p>
          )}
        </div>
      )}
      {!active.length && !isHost && <p>No options yet. The host will release some once the map is ready.</p>}

      {active.map((p: any) => {
        const st = STATUS[p.status];
        const responded = p.tally.support + p.tally.liveWith + p.tally.object;
        return (
          <article key={p.id} className="card">
            <div className="spread">
              <h3>{p.title}</h3>
              <span className={`pill ${st.tone}`}>{st.label}</span>
            </div>
            {p.version > 1 && <p className="small muted">Revision {p.version}</p>}
            <p>{p.summary}</p>
            <dl className="kv small">
              <dt>When</dt>
              <dd>{when(p.schedule)}</dd>
              {p.themes.length > 0 && (
                <>
                  <dt>Themes</dt>
                  <dd>{p.themes.join(" → ")}</dd>
                </>
              )}
              <dt>Split into</dt>
              <dd>{p.parts.join(", ")}</dd>
              {p.constraints.length > 0 && (
                <>
                  <dt>Every dish respects</dt>
                  <dd>{p.constraints.join("; ")}</dd>
                </>
              )}
            </dl>
            {p.tradeoffs.length > 0 && (
              <>
                <h3 style={{ marginTop: 12 }}>Trade-offs</h3>
                <ul className="small">
                  {p.tradeoffs.map((t: string, i: number) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </>
            )}
            {p.status !== "draft" && (
              <>
                <div className="tally small">
                  <span className="pill good">{p.tally.support} support</span>
                  <span className="pill">{p.tally.liveWith} can live with it</span>
                  <span className={`pill ${p.tally.object ? "bad" : ""}`}>{p.tally.object} object</span>
                  <span className="muted">
                    {responded} of {data.participantCount} responded
                  </span>
                </div>
                {p.objections.map((o: any, i: number) => (
                  <p key={i} className="notice small">
                    <strong>{o.author} objects:</strong> {o.reason}
                  </p>
                ))}
              </>
            )}
            {p.status === "open" && <Respond spaceId={spaceId} proposalId={p.id} mine={p.mine} />}

            {isHost && p.status === "draft" && (
              <div className="row" style={{ marginTop: 12 }}>
                <ToolButton tool="release_proposal" input={{ spaceId, proposalId: p.id }} className="primary" offerShare>
                  Release to the group
                </ToolButton>
                <EditProposal spaceId={spaceId} proposal={p} />
                <ToolButton tool="drop_proposal" input={{ spaceId, proposalId: p.id }} confirm="Drop this draft?">
                  Drop
                </ToolButton>
              </div>
            )}
            {isHost && p.status === "open" && (
              <div className="row" style={{ marginTop: 12 }}>
                {p.tally.object > 0 ? (
                  <ToolButton tool="draft_revision" input={{ spaceId, proposalId: p.id }} className="primary" busyLabel="Revising…">
                    Draft a revision that resolves the objections
                  </ToolButton>
                ) : (
                  <ToolButton
                    tool="adopt_proposal"
                    input={{ spaceId, proposalId: p.id }}
                    className="primary"
                    offerShare
                    confirm={`${responded} of ${data.participantCount} have responded and nobody objects. Record this as the group's plan?`}
                  >
                    Record as agreed
                  </ToolButton>
                )}
                <ToolButton tool="drop_proposal" input={{ spaceId, proposalId: p.id }} confirm="Drop this option?">
                  Drop
                </ToolButton>
              </div>
            )}
          </article>
        );
      })}

      {past.length > 0 && (
        <details>
          <summary>Earlier versions ({past.length})</summary>
          {past.map((p: any) => (
            <div key={p.id} className="card small">
              <div className="spread">
                <strong>{p.title}</strong>
                <span className="pill">{STATUS[p.status].label}</span>
              </div>
              <p className="muted">{when(p.schedule)}</p>
              {p.objections.map((o: any, i: number) => (
                <p key={i}>
                  {o.author} objected: {o.reason}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
    </>
  );
}
