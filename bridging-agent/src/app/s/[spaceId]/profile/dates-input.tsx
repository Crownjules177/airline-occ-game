"use client";

import { useState } from "react";
import { formatDateValue, normaliseDates } from "@/engine/dates";

/** Add single days or ranges with the phone's date picker; remove with one tap. */
export function DatesInput({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const add = () => {
    if (!from) return;
    onChange(normaliseDates([...value, to && to !== from ? `${from}/${to}` : from]));
    setFrom("");
    setTo("");
  };
  return (
    <div className="stack">
      {value.length > 0 ? (
        <div className="row">
          {value.map((v) => (
            <span key={v} className="pill" style={{ fontSize: "0.95rem", padding: "6px 6px 6px 12px" }}>
              {formatDateValue(v)}
              <button
                type="button"
                className="small"
                aria-label={`Remove ${formatDateValue(v)}`}
                style={{ minHeight: 28, padding: "0 10px", marginLeft: 6 }}
                onClick={() => onChange(value.filter((x) => x !== v))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="small muted">None added yet.</p>
      )}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 140px" }}>
          <label htmlFor={`${id}-from`} className="small">
            From
          </label>
          <input id={`${id}-from`} type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label htmlFor={`${id}-to`} className="small">
            To <span className="hint" style={{ display: "inline" }}>(optional)</span>
          </label>
          <input id={`${id}-to`} type="date" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="small" onClick={add} disabled={!from}>
          Add
        </button>
      </div>
    </div>
  );
}
