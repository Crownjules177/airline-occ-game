import { call } from "../../../lib/server";
import { CopyButton } from "../../../components/tool";
import { Settings } from "./settings";

const STATUS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "Chatting",
  ready: "Chat done",
  drafted: "Profile drafted",
  none: "No profile",
  draft: "Reviewing",
  approved: "Approved",
};

export default async function Host({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const [o, log] = await Promise.all([call("host_overview", { spaceId }), call("get_audit_log", { spaceId, limit: 50 })]);
  return (
    <>
      <div className="card stack">
        <h3>Invite people</h3>
        <p className="small">
          Post this link in your group chat. People join from their phone, with nothing to install.
        </p>
        <div className="row">
          <a className="btn whatsapp" href={o.inviteWhatsapp} target="_blank" rel="noreferrer">
            Share on WhatsApp
          </a>
          <CopyButton text={o.inviteUrl} />
        </div>
        <p className="hint" style={{ overflowWrap: "anywhere" }}>
          {o.inviteUrl}
        </p>
      </div>

      <h2>Who's where</h2>
      <p className="small muted">You see progress only. Private answers stay private, even from you.</p>
      <div className="card scroll-x">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Chat</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            {o.participants.map((p: any) => (
              <tr key={p.participantId}>
                <td>
                  {p.displayName}
                  {p.role === "host" && <span className="muted"> (host)</span>}
                </td>
                <td>{STATUS[p.intake]}</td>
                <td>
                  <span className={`pill ${p.profile === "approved" ? "good" : ""}`}>{STATUS[p.profile]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Settings</h2>
      <Settings spaceId={spaceId} settings={o.settings} stage={o.stage} />

      <h2>Audit log</h2>
      <p className="small muted">
        Every agent call with its prompt version, input and output, and every action taken. Newest first.
      </p>
      {log.agentCalls.map((c: any) => (
        <details key={c.id} className="card small">
          <summary>
            {new Date(c.createdAt).toLocaleString("en-AU")} · agent: {c.stage} (prompt v{c.promptVersion}, {c.model}, {c.durationMs} ms)
            {c.error && <span className="pill bad"> error</span>}
          </summary>
          {c.error && <p className="error">{c.error}</p>}
          <p>
            <strong>Input</strong>
          </p>
          <pre>{JSON.stringify(c.input, null, 2)}</pre>
          <p>
            <strong>Output</strong>
          </p>
          <pre>{JSON.stringify(c.output, null, 2)}</pre>
        </details>
      ))}
      <details className="card small">
        <summary>Actions ({log.events.length})</summary>
        <ul>
          {log.events.map((e: any) => (
            <li key={e.id}>
              {new Date(e.createdAt).toLocaleString("en-AU")} · {e.actorType} · {e.action}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
