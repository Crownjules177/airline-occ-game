"use client";

import { useState } from "react";
import { ErrorNote, useTool } from "../../../components/tool";

const SIGNALS = [
  { id: "support", label: "Support" },
  { id: "live_with", label: "Can live with it" },
  { id: "object", label: "Object" },
] as const;

export function Respond({ spaceId, proposalId, mine }: { spaceId: string; proposalId: string; mine: { signal: string; reason: string | null } | null }) {
  const { run, busy, error } = useTool();
  const [objecting, setObjecting] = useState(false);
  const [reason, setReason] = useState(mine?.reason ?? "");
  const current = objecting ? "object" : mine?.signal;
  return (
    <div style={{ marginTop: 12 }}>
      <p className="small" style={{ fontWeight: 600 }}>
        {mine ? "Your response (you can change it)" : "Your response"}
      </p>
      <div className="signals" role="group" aria-label="Your response">
        {SIGNALS.map((s) => (
          <button
            key={s.id}
            aria-pressed={current === s.id}
            disabled={busy}
            onClick={() => {
              if (s.id === "object") setObjecting(true);
              else {
                setObjecting(false);
                run("respond_to_proposal", { spaceId, proposalId, signal: s.id });
              }
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {objecting && (
        <form
          style={{ marginTop: 8 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run("respond_to_proposal", { spaceId, proposalId, signal: "object", reason })) setObjecting(false);
          }}
        >
          <label htmlFor={`reason-${proposalId}`} className="small">
            What would need to change for this to work for you?
          </label>
          <textarea id={`reason-${proposalId}`} value={reason} onChange={(e) => setReason(e.target.value)} required />
          <button className="small primary" style={{ marginTop: 6 }} disabled={busy || !reason.trim()}>
            Send objection
          </button>
        </form>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
