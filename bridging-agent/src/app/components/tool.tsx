"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export async function callToolClient<T = any>(name: string, input: unknown = {}): Promise<T> {
  const res = await fetch(`/api/tools/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({ ok: false, error: "The server didn't respond. Please try again." }));
  if (!body.ok) throw new Error(body.error);
  return body.result as T;
}

/** Call a tool, show errors, and refresh server data afterwards. */
export function useTool() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T = any>(name: string, input: unknown): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      const result = await callToolClient<T>(name, input);
      router.refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

/** A button that calls one tool. If the result carries a WhatsApp share URL, offer it. */
export function ToolButton(props: {
  tool: string;
  input: unknown;
  children: ReactNode;
  busyLabel?: string;
  confirm?: string;
  className?: string;
  offerShare?: boolean;
  onDone?: (result: any) => void;
}) {
  const { run, busy, error } = useTool();
  const [share, setShare] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className={props.className}
        disabled={busy}
        onClick={async () => {
          if (props.confirm && !window.confirm(props.confirm)) return;
          const result = await run(props.tool, props.input);
          if (result === undefined) return;
          if (props.offerShare && result && typeof result === "object" && "whatsapp" in result) setShare((result as any).whatsapp);
          props.onDone?.(result);
        }}
      >
        {busy ? (props.busyLabel ?? "Working…") : props.children}
      </button>
      {share && (
        <a className="btn whatsapp small" href={share} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
          Tell the group on WhatsApp
        </a>
      )}
      <ErrorNote error={error} />
    </span>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
