"use client";

import { useMemo, useState } from "react";
import { ErrorNote, useTool } from "../../../components/tool";

type Field = { key: string; label: string; description: string; type: string; options?: string[]; example?: string; constraint?: string };
type Entry = { value: string | number | string[] | null; visibility: "group" | "host" | "agent" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const VIS_LABEL = {
  group: "Everyone in the group",
  host: "Host only",
  agent: "Only the agent (used for matching, never shown)",
} as const;

function show(v: Entry["value"]) {
  if (v == null) return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

export function ProfileEditor({ spaceId, profile, fields, history }: { spaceId: string; profile: any; fields: Field[]; history: any[] }) {
  const { run, busy, error } = useTool();
  const [values, setValues] = useState<Record<string, Entry>>(() => structuredClone(profile.fields));
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, show(profile.fields[f.key]?.value ?? null)])),
  );
  const [summary, setSummary] = useState<string>(profile.summary);
  const [saved, setSaved] = useState(false);
  const approved = profile.status === "approved";

  const payload = useMemo(
    () =>
      Object.fromEntries(
        fields.map((f) => {
          const e = values[f.key] ?? { value: null, visibility: "group" };
          const textual = ["text", "number", "list"].includes(f.type);
          return [f.key, { value: textual ? text[f.key] : e.value, visibility: e.visibility }];
        }),
      ),
    [fields, values, text],
  );

  const set = (key: string, patch: Partial<Entry>) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: { ...(v[key] ?? { value: null, visibility: "group" }), ...patch } }));
  };
  const toggle = (key: string, option: string) => {
    const current = (values[key]?.value as string[] | null) ?? [];
    set(key, { value: current.includes(option) ? current.filter((x) => x !== option) : [...current, option] });
  };

  async function save(approve: boolean) {
    const r = await run("update_my_profile", { spaceId, summary, fields: payload, approve });
    if (r) setSaved(true);
  }

  return (
    <>
      {approved ? (
        <p className="notice">
          Approved and shared. Changes you save here are shared straight away, and every version is kept in your history.
        </p>
      ) : (
        <div className="card accent stack">
          <h3>Here's how I've summarised you</h3>
          <p>
            Nobody else can see this until you approve it. Fix anything that isn't right, and choose who sees each answer.
          </p>
        </div>
      )}

      <div className="card">
        <label htmlFor="summary">
          Summary <span className="hint">Shown to the group, next to your name.</span>
        </label>
        <textarea id="summary" value={summary} onChange={(e) => (setSaved(false), setSummary(e.target.value))} />
      </div>

      {fields.map((f) => {
        const entry = values[f.key] ?? { value: null, visibility: "group" };
        const id = `f-${f.key}`;
        return (
          <fieldset key={f.key} className="card" style={{ margin: "0 0 12px" }}>
            <legend className="sr-only">{f.label}</legend>
            <div className="field">
              {["text", "number", "list"].includes(f.type) ? (
                <>
                  <label htmlFor={id}>
                    {f.label}
                    <span className="hint">
                      {f.description}
                      {f.type === "list" && " Separate with commas."}
                    </span>
                  </label>
                  <input
                    id={id}
                    type={f.type === "number" ? "number" : "text"}
                    inputMode={f.type === "number" ? "numeric" : undefined}
                    value={text[f.key] ?? ""}
                    placeholder={f.example}
                    onChange={(e) => (setSaved(false), setText((t) => ({ ...t, [f.key]: e.target.value })))}
                  />
                </>
              ) : f.type === "choice" ? (
                <>
                  <label htmlFor={id}>
                    {f.label}
                    <span className="hint">{f.description}</span>
                  </label>
                  <select id={id} value={(entry.value as string) ?? ""} onChange={(e) => set(f.key, { value: e.target.value || null })}>
                    <option value="">Not said</option>
                    {f.options!.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 600 }}>{f.label}</span>
                  <span className="hint">{f.description}</span>
                  <div className="row" style={{ marginTop: 6 }}>
                    {(f.type === "weekdays" ? WEEKDAYS : f.options!).map((o) => (
                      <label key={o} className="check" style={{ marginRight: 10 }}>
                        <input
                          type="checkbox"
                          checked={((entry.value as string[] | null) ?? []).includes(o)}
                          onChange={() => toggle(f.key, o)}
                        />
                        <span>{o}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <label htmlFor={`${id}-vis`} className="small">
              Who can see this
            </label>
            <select id={`${id}-vis`} value={entry.visibility} onChange={(e) => set(f.key, { visibility: e.target.value as Entry["visibility"] })}>
              {(Object.keys(VIS_LABEL) as Entry["visibility"][]).map((v) => (
                <option key={v} value={v}>
                  {VIS_LABEL[v]}
                </option>
              ))}
            </select>
            {f.constraint === "hard" && (
              <p className="hint" style={{ marginTop: 6 }}>
                Every plan respects this. It only ever appears as an unnamed constraint, like "no nuts in this meal".
              </p>
            )}
          </fieldset>
        );
      })}

      <div className="composer">
        <ErrorNote error={error} />
        <div className="row">
          {!approved && (
            <button className="primary" disabled={busy} onClick={() => save(true)}>
              Approve and share
            </button>
          )}
          <button className={approved ? "primary" : ""} disabled={busy} onClick={() => save(false)}>
            {approved ? "Save changes" : "Save for later"}
          </button>
          {saved && <span className="pill good">Saved</span>}
        </div>
      </div>

      <details style={{ marginTop: 16 }}>
        <summary>Edit history</summary>
        <ul className="small">
          {history.map((h) => (
            <li key={h.version}>
              Version {h.version}: {h.editedBy === "agent" ? "drafted by the agent" : "edited by you"},{" "}
              {new Date(h.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
