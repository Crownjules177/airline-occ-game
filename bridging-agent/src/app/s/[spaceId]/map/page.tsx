import { call } from "../../../lib/server";
import { ToolButton } from "../../../components/tool";
import { FlagForm } from "./flag";

export default async function MapPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const [space, data] = await Promise.all([call("get_space", { spaceId }), call("get_map", { spaceId })]);
  const g = space.group;
  const pct = g.participants ? Math.round((100 * g.approvedProfiles) / g.participants) : 0;
  const ready = pct >= g.thresholdPercent;

  const hostControls = space.me.isHost && (
    <div className="card stack">
      <p className="small">
        {g.approvedProfiles} of {g.participants} profiles approved ({pct}%). The map needs {g.thresholdPercent}%.
      </p>
      <div className="row">
        <ToolButton tool="generate_map" input={{ spaceId, force: !ready }} className={ready ? "primary" : ""} busyLabel="Drawing the map…"
          confirm={ready ? undefined : `Only ${pct}% of profiles are approved. Draw the map anyway?`}>
          {data.map ? "Revise the map" : ready ? "Draw the group map" : "Draw it anyway"}
        </ToolButton>
      </div>
      {data.map && <p className="hint">Revising takes new profiles, ideas and everyone's flags into account.</p>}
    </div>
  );

  if (!data.map) {
    return (
      <>
        <p>The map appears once enough of the group has shared their profiles. It shows what you have in common, real constraints, who might pair up, and views only one or two people hold.</p>
        {hostControls}
      </>
    );
  }

  const feedbackFor = (id: string) => data.feedback.filter((f: any) => f.refId === id);
  return (
    <>
      <p className="muted small">
        Version {data.map.version}. Every item links to what people shared. Spot something wrong? Flag it and the agent will
        fix it in the next revision.
      </p>
      {data.kinds.map((kind: any) => {
        const items = data.map.items.filter((i: any) => i.kind === kind.kind);
        if (!items.length) return null;
        return (
          <section key={kind.kind}>
            <h2>{kind.label}</h2>
            <p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
              {kind.description}
            </p>
            {items.map((item: any) => (
              <article key={item.id} className="card">
                <div className="spread">
                  <h3>{item.title}</h3>
                  {item.minority && <span className="pill accent">Minority view</span>}
                </div>
                <p>{item.detail}</p>
                {item.sourceContributionIds.length > 0 && (
                  <details className="small">
                    <summary>Where this came from ({item.sourceContributionIds.length})</summary>
                    <ul>
                      {item.sourceContributionIds.map((id: string) =>
                        data.sources[id] ? (
                          <li key={id}>
                            <strong>{data.sources[id].author}</strong>: {data.sources[id].body}
                          </li>
                        ) : (
                          <li key={id} className="muted">
                            (no longer shared)
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                )}
                {item.kind === "constraint" && (
                  <p className="hint">Constraints are never linked to who they came from.</p>
                )}
                {feedbackFor(item.id).map((f: any) => (
                  <p key={f.id} className="notice small">
                    <strong>{f.author}:</strong> {f.body}
                  </p>
                ))}
                <FlagForm spaceId={spaceId} mapItemId={item.id} />
              </article>
            ))}
          </section>
        );
      })}
      {hostControls}
    </>
  );
}
