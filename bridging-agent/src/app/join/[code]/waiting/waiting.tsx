"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status = "pending" | "approved" | "declined" | "expired" | "used" | "none";

/** Checks every few seconds; signs this device in as soon as the host approves. */
export function Waiting({ code, host, nudge }: { code: string; host: string; nudge: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("pending");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const res = await fetch("/api/access/status", { cache: "no-store" });
        const body = await res.json();
        if (stopped) return;
        if (body.status === "approved") {
          router.replace(body.redirect);
          router.refresh();
          return;
        }
        setStatus(body.status);
        if (body.status !== "pending") return;
      } catch {
        // Offline for a moment; keep trying.
      }
      timer = setTimeout(check, document.hidden ? 15000 : 3000);
    }
    check();
    const wake = () => !document.hidden && (clearTimeout(timer), check());
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [router]);

  if (status === "pending") {
    return (
      <div className="card stack">
        <p>
          Your request is with {host}. Keep this page open: as soon as they approve it on their Host page, you'll be signed in
          here.
        </p>
        <p className="small muted">Requests last 24 hours. Only this phone or browser can use it.</p>
        <a className="btn whatsapp" href={nudge} target="_blank" rel="noreferrer">
          Let {host} know on WhatsApp
        </a>
      </div>
    );
  }
  const message: Record<Exclude<Status, "pending">, string> = {
    approved: "You're in.",
    declined: `${host} didn't approve this request. If that's a mistake, have a word with them and try again.`,
    expired: "This request has expired. You can ask again.",
    used: "This request has already been used to sign in.",
    none: "We couldn't find your request. You can ask again.",
  };
  return (
    <div className="card stack">
      <p>{message[status]}</p>
      <a className="btn" href={`/join/${code}?back=1`}>
        Back
      </a>
    </div>
  );
}
