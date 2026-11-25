import { call } from "../../../lib/server";
import { CopyButton, ToolButton } from "../../../components/tool";
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
      {o.accessRequests.length > 0 && (
        <div className="card accent stack" id="access">
          <h3>Asking to get back in</h3>
          <p className="small">
            {o.accessRequests.length === 1 ? "This household" : "These households"} lost their way in and asked from the invite page.
            Only approve if you know it's them (a message from them, or they're next to you). Approving signs in the phone that
            asked, nothing else; you never see a link, and they get a note that it happened.
          </p>
          {o.accessRequests.map((r: any) => (
            <div key={r.id} className="spread">
              <span>
                <strong>{r.householdName}</strong>{" "}
                <span className="muted small">
                  asked {new Date(r.createdAt).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: o.settings.timezone })}
                </span>
              </span>
              <span className="row">
                <ToolButton tool="decide_access_request" input={{ spaceId, requestId: r.id, approve: true }} className="primary small" busyLabel="Approving…">
                  Approve
                </ToolButton>
                <ToolButton tool="decide_access_request" input={{ spaceId, requestId: r.id, approve: false }} className="small" busyLabel="Declining…">
                  Decline
                </ToolButton>
              </span>
            </div>
          ))}
        </div>
      )}

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

      {o.awayDatesWhatsapp && (
        <div className="card stack">
          <h3>Dates people can't make</h3>
          <p className="small">
            Proposals avoid dates when too many are away. Anyone who joined before this was asked can add theirs on their
            profile in a minute. You'll only ever see whether they've answered, not
            their dates.
          </p>
          <a className="btn whatsapp" href={o.awayDatesWhatsapp} target="_blank" rel="noreferrer">
            Ask everyone on WhatsApp
          </a>
        </div>
      )}

      <h2>Who's where</h2>
      <p className="small muted">You see progress only. Private answers stay private, even from you.</p>
      <div className="card scroll-x">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Chat</th>
              <th>Profile</th>
              {o.awayDatesWhatsapp && <th>Away dates</th>}
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
                {o.awayDatesWhatsapp && <td>{p.awayDatesAnswered ? "Answered" : <span className="muted">Not yet</span>}</td>}
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
