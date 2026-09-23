import { call } from "../../../lib/server";
import { CopyButton, ToolButton } from "../../../components/tool";

export default async function PlanPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const data = await call("get_plan", { spaceId });
  if (!data.plan) {
    return <p>No plan yet. Once the group agrees an option, the dates and parts to claim appear here.</p>;
  }
  const tz = data.timezone;
  const fmtDate = new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const fmtTime = new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const webcal = data.feedUrl.replace(/^https?:/, "webcal:");
  const mine = data.events.flatMap((e: any) => e.commitments).filter((c: any) => c.mine).length;

  return (
    <>
      <div className="card">
        <h3>{data.plan.title}</h3>
        <p>{data.plan.summary}</p>
        {data.plan.constraints.length > 0 && (
          <p className="small">
            <strong>Every dish respects:</strong> {data.plan.constraints.join("; ")}
          </p>
        )}
        <p className="small muted">Plan version {data.plan.version}</p>
      </div>

      <div className="card stack">
        <h3>Put it in your calendar</h3>
        <p className="small">
          Subscribe once and every {data.taskNoun} you claim appears in your own calendar (Apple, Google, Outlook), with a
          reminder, and updates if plans change.
        </p>
        <div className="row">
          <a className="btn primary small" href={webcal}>
            Subscribe
          </a>
          <CopyButton text={data.feedUrl} label="Copy calendar link" />
        </div>
        <p className="hint">Keep this link private: it shows your claimed tasks. You have {mine} so far.</p>
      </div>

      {data.events.map((e: any) => {
        const start = new Date(e.startsAt);
        return (
          <section key={e.id} className="card">
            <div className="spread">
              <h3>{fmtDate.format(start)}</h3>
              <span className="muted small">
                {fmtTime.format(start)} · {e.location}
              </span>
            </div>
            {e.theme && <p className="small">Theme: {e.theme}</p>}
            <div className="parts">
              {e.commitments.map((c: any) => (
                <div key={c.id} className={`part${c.mine ? " mine" : ""}`}>
                  <div>
                    <div>{c.part}</div>
                    {c.who ? (
                      <div className="who small">
                        {c.mine ? "You" : c.who}
                        {c.status === "done" && " · done"}
                      </div>
                    ) : c.suggestion?.forMe ? (
                      <div className="small">
                        <span className="pill accent">Suggested for you</span>{" "}
                        <span className="muted">{c.suggestion.reasons.join(", ")}</span>
                      </div>
                    ) : c.suggestion ? (
                      <div className="small muted">Suggested: {c.suggestion.who}</div>
                    ) : (
                      <div className="small muted">Open</div>
                    )}
                  </div>
                  <div className="row">
                    {c.status === "open" && (
                      <ToolButton tool="claim_commitment" input={{ spaceId, commitmentId: c.id }} className={`small${c.suggestion?.forMe ? " primary" : ""}`}>
                        I'll bring it
                      </ToolButton>
                    )}
                    {c.mine && c.status === "claimed" && (
                      <>
                        <a className="btn small" href={`${data.feedUrl}?c=${c.id}`}>
                          Add to calendar
                        </a>
                        <ToolButton tool="release_commitment" input={{ spaceId, commitmentId: c.id }} className="small" confirm="Give this back so someone else can take it?">
                          Give back
                        </ToolButton>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
