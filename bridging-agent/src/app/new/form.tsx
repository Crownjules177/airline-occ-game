"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callToolClient, ErrorNote } from "../components/tool";

export function NewSpaceForm({ templates, signedIn }: { templates: any[]; signedIn: boolean }) {
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
          const r = await callToolClient("create_space", {
            name: f.get("name"),
            templateId: f.get("templateId"),
            displayName: f.get("displayName"),
            email: f.get("email") ?? undefined,
            consent: f.get("consent") === "on" ? true : undefined,
          });
          router.push(`/s/${r.spaceId}/host`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="name">Name of the space</label>
        <input id="name" name="name" type="text" required defaultValue="Building meal share" />
      </div>
      <div className="field">
        <label htmlFor="templateId">What kind of group</label>
        <select id="templateId" name="templateId" defaultValue="community-meals">
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="displayName">
          Your name in the group
          <span className="hint">For a meal share, your household name, like "The Nguyens".</span>
        </label>
        <input id="displayName" name="displayName" type="text" required />
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
            I agree the agent may use what I share here to help the group plan. I can see, edit, export or delete my data at
            any time.
          </span>
        </label>
      </div>
      <ErrorNote error={error} />
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create space"}
      </button>
    </form>
  );
}
