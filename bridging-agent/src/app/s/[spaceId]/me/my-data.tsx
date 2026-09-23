"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callToolClient, CopyButton, ErrorNote } from "../../../components/tool";

export function MyData({ spaceId, isHost, welcome }: { spaceId: string; isHost: boolean; welcome: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState<{ url: string; whatsapp: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card stack">
        <h3>Your sign-in link</h3>
        <p className="small">
          A personal link that signs you straight in. Keep it private. Making a new one switches the old one off.
        </p>
        {link ? (
          <>
            <div className="row">
              <a className="btn whatsapp" href={link.whatsapp} target="_blank" rel="noreferrer">
                Send to myself on WhatsApp
              </a>
              <CopyButton text={link.url} />
            </div>
            {welcome && (
              <a className="btn primary" href={`/s/${spaceId}/intake`}>
                Done, start the chat
              </a>
            )}
          </>
        ) : (
          <button
            className={welcome ? "primary" : ""}
            disabled={busy}
            onClick={() => act(async () => setLink(await callToolClient("rotate_my_sign_in_link")))}
          >
            {welcome ? "Get my sign-in link" : "Make a new sign-in link"}
          </button>
        )}
      </div>

      <div className="card stack">
        <h3>Download my data</h3>
        <p className="small">Everything stored about you in this space: your chat, profile and its history, ideas, responses and tasks.</p>
        <button
          disabled={busy}
          onClick={() =>
            act(async () => {
              const data = await callToolClient("export_my_data", { spaceId });
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "my-data.json";
              a.click();
              URL.revokeObjectURL(a.href);
            })
          }
        >
          Download (JSON)
        </button>
      </div>

      {!isHost && (
        <div className="card stack">
          <h3>Leave and delete my data</h3>
          <p className="small">
            Deletes your chat, profile, ideas and responses from this space, and gives back any tasks you've claimed. This
            can't be undone.
          </p>
          <button
            className="danger"
            disabled={busy}
            onClick={() =>
              act(async () => {
                if (!window.confirm("Delete everything you've shared in this space and leave it?")) return;
                await callToolClient("delete_my_data", { spaceId, confirm: true });
                router.push("/");
                router.refresh();
              })
            }
          >
            Leave and delete
          </button>
        </div>
      )}
      <ErrorNote error={error} />
    </>
  );
}
