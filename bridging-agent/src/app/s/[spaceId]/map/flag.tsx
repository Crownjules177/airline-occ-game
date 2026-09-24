"use client";

import { useState } from "react";
import { ErrorNote, useTool } from "../../../components/tool";

export function FlagForm({ spaceId, mapItemId }: { spaceId: string; mapItemId: string }) {
  const { run, busy, error } = useTool();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) {
    return (
      <button className="small" onClick={() => setOpen(true)}>
        Comment or flag
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run("flag_map_item", { spaceId, mapItemId, note })) {
          setOpen(false);
          setNote("");
        }
      }}
    >
      <label htmlFor={`flag-${mapItemId}`} className="small">
        What's missing or not quite right?
      </label>
      <textarea id={`flag-${mapItemId}`} value={note} onChange={(e) => setNote(e.target.value)} required />
      <ErrorNote error={error} />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="small primary" disabled={busy || !note.trim()}>
          Send
        </button>
        <button type="button" className="small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
