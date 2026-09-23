"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <h1>Sign in</h1>
      {params.get("expired") && <p className="notice">That link has expired or was already used. Ask for a new one below.</p>}
      {state === "sent" ? (
        <div className="card stack">
          <p>If that email belongs to a member, a sign-in link is on its way. It works once, for 15 minutes.</p>
          {devLink && (
            <p className="notice small">
              Email isn't set up on this server, so here's the link (development only): <a href={devLink}>sign in</a>
            </p>
          )}
        </div>
      ) : (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            setState("busy");
            setError(null);
            const res = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, next: params.get("next") ?? undefined }),
            });
            const body = await res.json();
            if (!body.ok) {
              setError(body.error);
              setState("idle");
              return;
            }
            setDevLink(body.devLink ?? null);
            setState("sent");
          }}
        >
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={state === "busy"}>
            Email me a sign-in link
          </button>
        </form>
      )}
      <p className="small muted">
        Joined without an email? Use the personal sign-in link you saved when you joined (for example in your WhatsApp chat
        with yourself).
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
