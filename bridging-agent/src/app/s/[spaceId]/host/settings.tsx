"use client";

import { useState } from "react";
import { ErrorNote, useTool } from "../../../components/tool";

export function Settings({ spaceId, settings, stage }: { spaceId: string; settings: any; stage: string }) {
  const { run, busy, error } = useTool();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const ok = await run("update_space_settings", {
          spaceId,
          mapThresholdPercent: Number(f.get("threshold")),
          location: f.get("location"),
          stage: f.get("stage"),
        });
        if (ok) setSaved(true);
      }}
    >
      <div className="field">
        <label htmlFor="threshold">
          Map threshold (%) <span className="hint">Share of approved profiles before the map can be drawn.</span>
        </label>
        <input id="threshold" name="threshold" type="number" min={1} max={100} defaultValue={settings.mapThresholdPercent} />
      </div>
      <div className="field">
        <label htmlFor="location">Where you meet</label>
        <input id="location" name="location" type="text" defaultValue={settings.location} />
      </div>
      <div className="field">
        <label htmlFor="stage">
          Stage <span className="hint">Moves on automatically; change it here to override.</span>
        </label>
        <select id="stage" name="stage" defaultValue={stage}>
          <option value="intake">Intake</option>
          <option value="map">Map</option>
          <option value="agree">Agree</option>
          <option value="act">Act</option>
          <option value="sustain">Sustain</option>
        </select>
      </div>
      <ErrorNote error={error} />
      <div className="row">
        <button disabled={busy}>Save settings</button>
        {saved && <span className="pill good">Saved</span>}
      </div>
    </form>
  );
}
