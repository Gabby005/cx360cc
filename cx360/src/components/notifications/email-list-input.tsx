"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { EMAIL_RE } from "@/lib/notification-settings";

/** Type an email address and press Enter (or comma) to add it; click × to remove. */
export function EmailListInput({ label, hint, value, onChange, placeholder }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function commit(raw: string) {
    const parts = raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return;
    const bad = parts.find((p) => !EMAIL_RE.test(p));
    if (bad) {
      setErr(`"${bad}" isn't a valid email address`);
      return;
    }
    setErr(null);
    onChange([...new Set([...value, ...parts])]);
    setText("");
  }

  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand/30">
        {value.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-md bg-brand-light dark:bg-brand/20 px-2 py-0.5 text-xs">
            {e}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== e))} aria-label={`Remove ${e}`} className="opacity-60 hover:opacity-100">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setErr(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && commit(text)}
          placeholder={value.length ? "Add another…" : placeholder ?? "name@bank.com"}
          className="flex-1 min-w-[160px] bg-transparent outline-none text-sm py-0.5"
        />
      </div>
      {err ? <p className="text-xs text-sla-breach mt-1">{err}</p> : hint ? <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-1">{hint}</p> : null}
    </div>
  );
}
