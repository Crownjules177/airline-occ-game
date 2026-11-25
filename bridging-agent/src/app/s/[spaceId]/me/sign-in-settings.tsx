"use client";

import { useState } from "react";
import { useTool, ErrorNote } from "../../../components/tool";

/** Where we send sign-in links, and a way to cut off other devices. */
export function SignInSettings({ email, emailEnabled }: { email: string | null; emailEnabled: boolean }) {
  const { run, busy, error } = useTool();
  const [value, setValue] = useState(email ?? "");
  const [saved, setSaved] = useState(false);
  const [others, setOthers] = useState<{ busy: boolean; done?: number; error?: string }>({ busy: false });

  return (
    <>
      <div className="card stack" id="email">
        <h3>Sign-in email</h3>
        <p className="small">
          {emailEnabled
            ? "If you lose your way back in, open the sign-in page or your invite link and we'll email a link here. We use it for nothing else, and nobody in the group sees it."
            : "Once email sign-in is switched on, we can send sign-in links here. We use it for nothing else, and nobody in the group sees it."}
        </p>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaved(false);
            const r = await run("update_my_email", { email: value });
            if (r) setSaved(true);
          }}
        >
          <div className="field">
            <label htmlFor="my-email">Email</label>
            <input id="my-email" type="email" autoComplete="email" required value={value} onChange={(e) => (setValue(e.target.value), setSaved(false))} />
          </div>
          <ErrorNote error={error} />
          {saved && <p className="notice small">Saved.</p>}
          <button type="submit" disabled={busy || value.trim().toLowerCase() === (email ?? "")}>
            {busy ? "Saving…" : email ? "Change email" : "Save email"}
          </button>
        </form>
      </div>

      <div className="card stack">
        <h3>Other devices</h3>
        <p className="small">
          Lost a phone, or signed in somewhere you shouldn't stay signed in? This signs out everywhere except here and switches off
          your old sign-in links.
        </p>
        {others.done != null ? (
          <p className="notice small">
            Done. {others.done === 1 ? "1 other device was" : `${others.done} other devices were`} signed out.
          </p>
        ) : (
          <button
            type="button"
            disabled={others.busy}
            onClick={async () => {
              if (!window.confirm("Sign out all your other devices?")) return;
              setOthers({ busy: true });
              const res = await fetch("/api/auth/logout-others", { method: "POST" });
              const body = await res.json().catch(() => ({ ok: false, error: "The server didn't respond." }));
              setOthers(body.ok ? { busy: false, done: body.ended } : { busy: false, error: body.error });
            }}
          >
            {others.busy ? "Signing out…" : "Sign out other devices"}
          </button>
        )}
        <ErrorNote error={others.error ?? null} />
      </div>
    </>
  );
}
