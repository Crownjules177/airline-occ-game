"use client";

import { useState } from "react";
import { ErrorNote, useTool } from "../../../components/tool";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function EditProposal({ spaceId, proposal }: { spaceId: string; proposal: any }) {
  const { run, busy, error } = useTool();
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)}>Edit</button>;
  const s = proposal.schedule;
  return (
    <form
      className="card"
      style={{ width: "100%", marginTop: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const ok = await run("edit_proposal", {
          spaceId,
          proposalId: proposal.id,
          title: f.get("title"),
          summary: f.get("summary"),
          weekday: f.get("weekday"),
          cadence: f.get("cadence"),
          startDate: f.get("startDate"),
          occurrences: Number(f.get("occurrences")),
          skipDates: f.getAll("skip").map(String),
          time: f.get("time"),
          themes: lines(String(f.get("themes"))),
          parts: lines(String(f.get("parts"))),
          tradeoffs: lines(String(f.get("tradeoffs"))),
        });
        if (ok) setOpen(false);
      }}
    >
      <div className="field">
        <label htmlFor="p-title">Title</label>
        <input id="p-title" name="title" type="text" defaultValue={proposal.title} />
      </div>
      <div className="field">
        <label htmlFor="p-summary">Summary</label>
        <textarea id="p-summary" name="summary" defaultValue={proposal.summary} />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="p-weekday">Day</label>
          <select id="p-weekday" name="weekday" defaultValue={s.weekday}>
            {WEEKDAYS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="p-cadence">How often</label>
          <select id="p-cadence" name="cadence" defaultValue={s.cadence}>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="p-start">From</label>
          <input id="p-start" name="startDate" type="date" defaultValue={s.startDate} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="p-time">Time</label>
          <input id="p-time" name="time" type="time" defaultValue={s.time} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="p-occ">Times</label>
          <input id="p-occ" name="occurrences" type="number" min={1} defaultValue={s.occurrences} />
        </div>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
        <legend style={{ fontWeight: 600, marginBottom: 4 }}>
          Skip dates <span className="hint">Ticked dates are left out and later dates fill in.</span>
        </legend>
        {[...new Set([...proposal.dates.map((d: any) => d.date), ...(s.skipDates ?? [])])].sort().map((date: string) => {
          const info = proposal.dates.find((d: any) => d.date === date);
          return (
            <label key={date} className="check">
              <input type="checkbox" name="skip" value={date} defaultChecked={(s.skipDates ?? []).includes(date)} />
              <span>
                {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                {info?.away > 0 && <span className="muted"> · {info.away} away</span>}
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="field">
        <label htmlFor="p-themes">
          Themes <span className="hint">One per line, in order.</span>
        </label>
        <textarea id="p-themes" name="themes" defaultValue={proposal.themes.join("\n")} />
      </div>
      <div className="field">
        <label htmlFor="p-parts">
          Parts <span className="hint">One per line, e.g. Main, Side, Dessert, or Protein, Carb, Veg.</span>
        </label>
        <textarea id="p-parts" name="parts" defaultValue={proposal.parts.join("\n")} />
      </div>
      <div className="field">
        <label htmlFor="p-tradeoffs">
          Trade-offs <span className="hint">One per line.</span>
        </label>
        <textarea id="p-tradeoffs" name="tradeoffs" defaultValue={proposal.tradeoffs.join("\n")} />
      </div>
      <p className="hint">Hard constraints are always re-applied, and themes that break them are replaced.</p>
      <ErrorNote error={error} />
      <div className="row">
        <button className="primary" disabled={busy}>
          Save draft
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
