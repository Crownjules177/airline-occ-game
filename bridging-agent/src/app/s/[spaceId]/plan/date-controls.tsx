"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callToolClient, ErrorNote, useTool } from "../../../components/tool";

/** "Can't make this one" / "We can come after all", for the caller's own household. */
export function MyAnswer(props: { spaceId: string; eventId: string; meAway: boolean; myParts: string[]; noun: string }) {
  const { run, busy, error } = useTool();
  const [cover, setCover] = useState<string | null>(null);
  if (cover) {
    return (
      <div className="stack small">
        <p className="notice">Noted, and your part is free for someone else to take.</p>
        <a className="btn whatsapp small" href={cover} target="_blank" rel="noreferrer">
          Ask the group to cover it
        </a>
      </div>
    );
  }
  return (
    <div className="row small">
      {props.meAway ? (
        <>
          <span className="pill bad">You can't make this one</span>
          <button type="button" className="small" disabled={busy} onClick={() => run("set_my_attendance", { spaceId: props.spaceId, eventId: props.eventId, status: "coming" })}>
            {busy ? "Saving…" : "We can come after all"}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="small"
          disabled={busy}
          onClick={async () => {
            if (props.myParts.length && !window.confirm(`This gives back your ${props.myParts.join(" and ").toLowerCase()} so someone else can take it. OK?`)) return;
            const r = await run<{ whatsapp: string | null }>("set_my_attendance", { spaceId: props.spaceId, eventId: props.eventId, status: "away" });
            if (r?.whatsapp) setCover(r.whatsapp);
          }}
        >
          {busy ? "Saving…" : `Can't make this ${props.noun}`}
        </button>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

type Option = { date: string; weekday: string; coming: number; total: number; sameWeekday: boolean; keepsParts: number };

const fmt = (date: string) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));

/** Host: move or skip one date. The host decides; the group is told. */
export function ChangeDate(props: { spaceId: string; eventId: string; date: string; time: string; skipped: boolean; claimed: number; open: boolean }) {
  const router = useRouter();
  const [options, setOptions] = useState<Option[] | null>(null);
  const [date, setDate] = useState(props.date);
  const [time, setTime] = useState(props.time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<{ text: string; url: string } | null>(null);

  async function act(name: string, input: object, done: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await callToolClient<{ whatsapp: string; freed?: string[] }>(name, { spaceId: props.spaceId, eventId: props.eventId, ...input });
      const freed = r.freed?.length ? ` ${r.freed.join(" and ")} ${r.freed.length === 1 ? "is" : "are"} open again (that household is away then).` : "";
      setShare({ text: done + freed, url: r.whatsapp });
      setOptions(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (share) {
    return (
      <div className="stack small">
        <p className="notice">{share.text}</p>
        <div className="row">
          <a className="btn whatsapp small" href={share.url} target="_blank" rel="noreferrer">
            Tell the group on WhatsApp
          </a>
          <button type="button" className="small" onClick={() => setShare(null)}>
            Done
          </button>
        </div>
      </div>
    );
  }
  if (props.skipped) {
    return (
      <div className="row small">
        <button type="button" className="small" disabled={busy} onClick={() => act("skip_event", { skip: false }, "It's back on.")}>
          {busy ? "Working…" : "Put this date back"}
        </button>
        <ErrorNote error={error} />
      </div>
    );
  }
  return (
    <details className="change-date" open={props.open}>
      <summary className="small">Change this date</summary>
      <div className="stack small">
        {options === null ? (
          <button
            type="button"
            className="small primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setOptions((await callToolClient<{ options: Option[] }>("suggest_event_dates", { spaceId: props.spaceId, eventId: props.eventId })).options);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Looking…" : "Find a better date"}
          </button>
        ) : options.length ? (
          <div className="stack">
            <p className="muted">Nearby dates, most households free first (from everyone's away dates):</p>
            {options.map((o) => (
              <button key={o.date} type="button" className="small option" disabled={busy} onClick={() => act("move_event", { date: o.date }, `Moved to ${fmt(o.date)}.`)}>
                <strong>{fmt(o.date)}</strong> · {o.coming} of {o.total} free
                {props.claimed > 0 && o.keepsParts < props.claimed && <span className="muted"> · some claimed parts would reopen</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">No nearby date looks better. Pick one below or skip this one.</p>
        )}
        <div className="row">
          <label className="sr-only" htmlFor={`d-${props.eventId}`}>
            New date
          </label>
          <input id={`d-${props.eventId}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="sr-only" htmlFor={`t-${props.eventId}`}>
            Time
          </label>
          <input id={`t-${props.eventId}`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <button type="button" className="small" disabled={busy || (date === props.date && time === props.time)} onClick={() => act("move_event", { date, time }, `Moved to ${fmt(date)}, ${time}.`)}>
            Move
          </button>
        </div>
        <button
          type="button"
          className="small danger"
          disabled={busy}
          onClick={() => window.confirm("Skip this date? The rest of the plan stays as it is, and you can put it back.") && act("skip_event", { skip: true }, "Skipped.")}
        >
          Skip this date
        </button>
        <ErrorNote error={error} />
      </div>
    </details>
  );
}
