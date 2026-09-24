import Link from "next/link";
import { call } from "../../lib/server";
import { IdeaForm } from "./idea-form";

const ORDER = ["intake", "map", "agree", "act", "sustain", "bridge"];

export default async function SpaceHome({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const s = await call("get_space", { spaceId });
  const base = `/s/${spaceId}`;
  const p = s.progress;
  const g = s.group;
  const pct = g.participants ? Math.round((100 * g.approvedProfiles) / g.participants) : 0;

  let next: { title: string; body: string; href: string; cta: string } | null = null;
  if (p.intake === "not_started" || p.intake === "in_progress") {
    next = {
      title: p.intake === "not_started" ? "Start with a short chat" : "Pick up your chat where you left off",
      body: "About 8 minutes. Type or use your phone's dictation.",
      href: `${base}/intake`,
      cta: p.intake === "not_started" ? "Start chat" : "Continue",
    };
  } else if (p.profile !== "approved") {
    next = {
      title: "Check your profile",
      body: "Nothing is shared until you approve it. Edit anything, and choose who sees each answer.",
      href: `${base}/profile`,
      cta: "Review profile",
    };
  } else if (p.openProposals > p.respondedProposals) {
    next = {
      title: `${p.openProposals - p.respondedProposals} option(s) need your view`,
      body: "Support, can live with it, or object. Objections lead to a revision.",
      href: `${base}/proposals`,
      cta: "Respond",
    };
  } else if (s.space.stage === "act" || s.space.stage === "sustain") {
    next = { title: "The plan is agreed", body: `Claim your part of each ${s.template.eventNoun}.`, href: `${base}/plan`, cta: "See the plan" };
  }

  const stages = s.template.stages.filter((x: any) => x.enabled);
  const current = ORDER.indexOf(s.space.stage);
  return (
    <>
      {next ? (
        <div className="card accent stack">
          <h3>{next.title}</h3>
          <p>{next.body}</p>
          <Link className="btn primary" href={next.href}>
            {next.cta}
          </Link>
        </div>
      ) : (
        <div className="card stack">
          <h3>You're all caught up</h3>
          <p className="muted">
            {s.space.stage === "intake"
              ? "The map appears once enough of the group has approved their profiles."
              : "The host will release options for the group soon."}
          </p>
        </div>
      )}

      <h2>Where the group is</h2>
      <ul className="stages">
        {stages.map((st: any) => {
          const i = ORDER.indexOf(st.id);
          return (
            <li key={st.id} className={i < current ? "done" : i === current ? "current" : ""}>
              <span className="dot" aria-hidden />
              <span>
                {st.label}
                {i === current && <span className="sr-only"> (current stage)</span>}
                <span className="hint">{st.description}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="card">
        <div className="spread">
          <strong>Profiles approved</strong>
          <span>
            {g.approvedProfiles} of {g.participants}
          </span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profiles approved">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="small muted">The group map is drawn at {g.thresholdPercent}%.</p>
      </div>

      <h2>Share an idea</h2>
      <p className="muted small">Anything you'd like the group to consider. It's credited to you and feeds the map and proposals.</p>
      <IdeaForm spaceId={spaceId} />
    </>
  );
}
