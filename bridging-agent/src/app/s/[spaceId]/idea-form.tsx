"use client";

import { useState } from "react";
import { ErrorNote, useTool } from "../../components/tool";

export function IdeaForm({ spaceId }: { spaceId: string }) {
  const { run, busy, error } = useTool();
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run("submit_contribution", { spaceId, kind: "idea", body })) {
          setBody("");
          setSent(true);
        }
      }}
    >
      <label htmlFor="idea" className="sr-only">
        Your idea
      </label>
      <textarea
        id="idea"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSent(false);
        }}
        placeholder="Could we do a curry month?"
        required
      />
      <ErrorNote error={error} />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="submit" disabled={busy || !body.trim()}>
          Share with the group
        </button>
        {sent && <span className="pill good">Shared</span>}
      </div>
    </form>
  );
}
