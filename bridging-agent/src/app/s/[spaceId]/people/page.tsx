import { call } from "../../../lib/server";

function show(v: unknown) {
  return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
}

export default async function People({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const [space, people] = await Promise.all([call("get_space", { spaceId }), call<any[]>("get_group_profiles", { spaceId })]);
  return (
    <>
      <p className="muted small">
        What each {space.template.unit.singular} has chosen to share.{" "}
        {space.me.isHost ? "As host you also see answers marked host-only." : ""} Answers marked agent-only are never shown to
        anyone.
      </p>
      {people.map((p) => (
        <div key={p.participantId} className="card">
          <div className="spread">
            <h3>
              {p.displayName}
              {p.participantId === space.me.participantId && <span className="muted"> (you)</span>}
            </h3>
            {p.status !== "approved" && <span className="pill">Not shared yet</span>}
          </div>
          {p.summary && <p>{p.summary}</p>}
          {p.fields.filter((f: any) => show(f.value)).length > 0 && (
            <dl className="kv small">
              {p.fields
                .filter((f: any) => show(f.value))
                .map((f: any) => (
                  <div key={f.key} style={{ display: "contents" }}>
                    <dt>
                      {f.label}
                      {f.visibility !== "group" && <span className="pill warn" style={{ marginLeft: 6 }}>{f.visibility === "host" ? "host only" : "only you"}</span>}
                    </dt>
                    <dd>{show(f.value)}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      ))}
    </>
  );
}
