"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callToolClient, ErrorNote } from "../../components/tool";

export function JoinForm({ code, household, signedIn }: { code: string; household: boolean; signedIn: boolean; spaceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          const r = await callToolClient("join_space", {
            inviteCode: code,
            displayName: f.get("displayName"),
            email: f.get("email") ?? undefined,
            consent: f.get("consent") === "on" ? true : undefined,
          });
          router.push(r.newAccount ? `/s/${r.spaceId}/me?welcome=1` : `/s/${r.spaceId}/intake`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="displayName">
          {household ? "Household name" : "Your name"}
          {household && <span className="hint">How neighbours know you, like "The Patels" or "Sam and Alex".</span>}
        </label>
        <input id="displayName" name="displayName" type="text" required autoComplete="name" />
      </div>
      {!signedIn && (
        <div className="field">
          <label htmlFor="email">
            Email <span className="hint">Optional. Lets you sign back in with an emailed link.</span>
          </label>
          <input id="email" name="email" type="email" autoComplete="email" />
        </div>
      )}
      <div className="field">
        <label className="check">
          <input type="checkbox" name="consent" required />
          <span>
            I agree the agent may use what I share to help the group plan. I choose what others see, and can edit, export or
            delete my data at any time.
          </span>
        </label>
      </div>
      <ErrorNote error={error} />
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
