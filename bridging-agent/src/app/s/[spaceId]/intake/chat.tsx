"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { callToolClient, ErrorNote } from "../../../components/tool";

type Intake = {
  messages: { role: "agent" | "participant"; text: string }[];
  topicsCovered: string[];
  totalTopics: number;
  status: string;
  canDraft: boolean;
};

/** Minimal typing for the Web Speech API, which is still vendor-prefixed in some browsers. */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start(): void;
  stop(): void;
};

export function Chat({ spaceId, initial }: { spaceId: string; initial: Intake }) {
  const router = useRouter();
  const [intake, setIntake] = useState(initial);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [intake.messages.length, pending]);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setSpeechSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  function toggleDictation() {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = navigator.language || "en-AU";
    r.interimResults = false;
    r.continuous = true;
    const before = text;
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((res) => res[0].transcript)
        .join(" ");
      setText([before, said].filter(Boolean).join(" "));
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  }

  async function send() {
    const message = text.trim();
    if (!message) return;
    recognition.current?.stop();
    setPending(message);
    setText("");
    setError(null);
    try {
      setIntake(await callToolClient<Intake>("send_intake_message", { spaceId, text: message }));
    } catch (e) {
      setText(message);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      await callToolClient("draft_my_profile", { spaceId });
      router.push(`/s/${spaceId}/profile`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDrafting(false);
    }
  }

  const ready = intake.status === "ready";
  const pct = Math.round((100 * intake.topicsCovered.length) / intake.totalTopics);
  return (
    <>
      <div className="spread small muted">
        <span>
          {intake.topicsCovered.length} of {intake.totalTopics} topics
        </span>
        <span>You can stop and come back any time.</span>
      </div>
      <div className="progress" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="chat" aria-live="polite">
        {intake.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <span className="sr-only">{m.role === "agent" ? "Agent: " : "You: "}</span>
            {m.text}
          </div>
        ))}
        {pending && (
          <>
            <div className="bubble participant">{pending}</div>
            <div className="bubble agent muted">…</div>
          </>
        )}
        <div ref={end} />
      </div>

      {(ready || intake.status === "drafted") && (
        <div className="card accent stack">
          <p>
            {intake.status === "drafted"
              ? "You can redraft your profile from this conversation at any time. Your visibility choices are kept."
              : "That's everything. I'll draft a short profile for you to check. Nothing is shared until you approve it."}
          </p>
          <button className="primary" onClick={draft} disabled={drafting}>
            {drafting ? "Drafting…" : intake.status === "drafted" ? "Redraft my profile" : "Draft my profile"}
          </button>
        </div>
      )}

      <div className="composer">
        <ErrorNote error={error} />
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <textarea
          id="answer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type, or tap the microphone on your keyboard to dictate"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={send} disabled={!!pending || !text.trim()}>
            Send
          </button>
          {speechSupported && (
            <button onClick={toggleDictation} aria-pressed={listening}>
              {listening ? "Stop dictation" : "Dictate"}
            </button>
          )}
          {intake.canDraft && !ready && intake.status !== "drafted" && (
            <button onClick={draft} disabled={drafting}>
              {drafting ? "Drafting…" : "Draft my profile now"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
