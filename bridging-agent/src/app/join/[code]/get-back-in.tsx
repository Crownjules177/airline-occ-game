"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmailSignIn } from "../../components/email-sign-in";

type Household = { id: string; name: string };

/** For people who already joined and lost their way back in: email link first, host approval otherwise. */
export function GetBackIn(props: {
  code: string;
  spaceId: string;
  hostName: string;
  households: Household[];
  emailEnabled: boolean;
  unit: string;
  open: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"email" | "host">(props.emailEnabled ? "email" : "host");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = props.hostName || "the host";

  return (
    <details className="card stack" open={props.open} id="get-back-in">
      <summary>
        <strong>Already joined? Get back in</strong>
      </summary>
      {props.emailEnabled && (
        <div className="row toggle">
          <button type="button" className="small" aria-pressed={mode === "email"} onClick={() => setMode("email")}>
            I gave an email
          </button>
          <button type="button" className="small" aria-pressed={mode === "host"} onClick={() => setMode("host")}>
            No email
          </button>
        </div>
      )}
      {mode === "email" ? (
        <>
          <p className="small">We'll email you a fresh sign-in link. It opens the group straight away.</p>
          <EmailSignIn
            next={`/s/${props.spaceId}`}
            onEmailOff={
              <p>
                Email sign-in isn't switched on yet. Choose <strong>No email</strong> above and {host} can let you back in.
              </p>
            }
          />
        </>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res = await fetch("/api/access/request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ inviteCode: props.code, participantId: pick }),
            });
            const body = await res.json().catch(() => ({ ok: false, error: "The server didn't respond. Please try again." }));
            if (!body.ok) {
              setError(body.error);
              setBusy(false);
              return;
            }
            router.push(`/join/${props.code}/waiting`);
          }}
        >
          <p className="small">
            Pick your {props.unit} and {host} gets a request on their Host page. Once they approve it, this phone is signed in.
            They never see or send a link, and you'll get a note in the app that it happened.
          </p>
          <div className="field">
            <label htmlFor="household">Your {props.unit}</label>
            <select id="household" required value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {props.households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={busy || !pick}>
            {busy ? "Asking…" : `Ask ${host} to let me back in`}
          </button>
        </form>
      )}
    </details>
  );
}
