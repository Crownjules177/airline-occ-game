"use client";

import { useState } from "react";

/** "Email me a sign-in link". Says plainly what happened, including when email is switched off. */
export function EmailSignIn({ next, label = "Email me a sign-in link", onEmailOff }: { next?: string; label?: string; onEmailOff?: React.ReactNode }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <div className="stack">
        {emailEnabled ? (
          <p>
            If <strong>{email}</strong> belongs to a member, a sign-in link is on its way. It works once, for 15 minutes. Check
            your spam folder if it hasn't arrived in a minute.
          </p>
        ) : (
          (onEmailOff ?? <p>Email sign-in isn't switched on for this site yet, so no email was sent.</p>)
        )}
        {devLink && (
          <p className="notice small">
            Email isn't set up on this server, so here's the link (development only): <a href={devLink}>sign in</a>
          </p>
        )}
        <button type="button" className="small" onClick={() => setState("idle")}>
          Try a different email
        </button>
      </div>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, next }),
        });
        const body = await res.json().catch(() => ({ ok: false, error: "The server didn't respond. Please try again." }));
        if (!body.ok) {
          setError(body.error);
          setState("idle");
          return;
        }
        setDevLink(body.devLink ?? null);
        setEmailEnabled(body.emailEnabled !== false);
        setState("sent");
      }}
    >
      <div className="field">
        <label htmlFor="signin-email">Email</label>
        <input id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Sending…" : label}
      </button>
    </form>
  );
}
