import Link from "next/link";
import { call, getCtx } from "./lib/server";

export default async function Home() {
  const ctx = await getCtx();
  const spaces = ctx.accountId ? await call<any[]>("list_my_spaces") : [];
  return (
    <>
      {spaces.length > 0 ? (
        <>
          <h1>Your spaces</h1>
          {spaces.map((s) => (
            <Link key={s.spaceId} href={`/s/${s.spaceId}`} className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <div className="spread">
                <h3>{s.name}</h3>
                {s.role === "host" && <span className="pill accent">Host</span>}
              </div>
              <p className="muted small">
                {s.template} · you're in as {s.displayName}
              </p>
            </Link>
          ))}
          <p>
            <Link href="/new" className="btn">
              Start another space
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1>Plan together without one person doing all the organising</h1>
          <p>
            The bridging agent chats with each person about what they want and can offer, shows the group where it agrees and
            differs, drafts options for everyone to weigh in on, and keeps things moving. People make every decision.
          </p>
          <div className="card stack">
            <h3>Got an invite link?</h3>
            <p className="muted">Open it on your phone. There's nothing to install.</p>
          </div>
          <div className="row">
            <Link href="/new" className="btn primary">
              Start a space
            </Link>
            <Link href="/login" className="btn">
              Sign in
            </Link>
          </div>
        </>
      )}
      <h2>How it works</h2>
      <ol className="stack">
        <li>
          <strong>A short chat.</strong> Around eight minutes, typed or dictated. You approve exactly how the agent summarises
          you before anyone sees it.
        </li>
        <li>
          <strong>A map of the group.</strong> Shared tastes, real constraints, who might pair up, and the views only one or two
          people hold, kept visible.
        </li>
        <li>
          <strong>Agree a plan.</strong> Two or three options. Support, can live with it, or object. Objections lead to a
          revision, not a vote.
        </li>
        <li>
          <strong>Do it.</strong> Claim your part. It goes straight into your own calendar.
        </li>
      </ol>
      <p className="small muted">
        Open source (Apache 2.0). Every agent prompt, input and output is logged for the host to inspect.
      </p>
    </>
  );
}
