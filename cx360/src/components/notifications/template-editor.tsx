"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SAMPLE_VARS,
  VARIABLES,
  renderTemplate,
  smsInfo,
  unknownVariables,
  type TemplateDef,
} from "@/lib/notification-templates";

export type TemplateState = { enabled: boolean; subject: string; body: string; isCustom: boolean };

/**
 * Edit one message: subject + wording, click-to-insert placeholders, a live
 * preview filled with sample ticket details, save / reset to default, and
 * (for emails) "send me a test". Used on the Notifications page and inside
 * each SLA escalation level on the Workflows page.
 */
export function TemplateEditor({ def, initial, bankName }: { def: TemplateDef; initial: TemplateState; bankName?: string }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState<"save" | "reset" | "test" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState<"subject" | "body">("body");

  const dirty = state.enabled !== saved.enabled || state.subject !== saved.subject || state.body !== saved.body;
  const bad = useMemo(() => unknownVariables(`${state.subject}\n${state.body}`), [state.subject, state.body]);
  const vars = useMemo(() => ({ ...SAMPLE_VARS, bankName: bankName || SAMPLE_VARS.bankName }), [bankName]);
  const sms = def.channel === "sms" ? smsInfo(renderTemplate(state.body, vars)) : null;

  function insert(token: string) {
    const text = `{{${token}}}`;
    const el = focus === "subject" && def.channel === "email" ? subjectRef.current : bodyRef.current;
    const field = el === subjectRef.current ? "subject" : "body";
    const cur = state[field];
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + text + cur.slice(end);
    setState((s) => ({ ...s, [field]: next }));
    setMsg(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function call(kind: "save" | "reset" | "test") {
    setBusy(kind);
    setMsg(null);
    const url = kind === "test" ? "/api/admin/notification-test" : `/api/admin/notification-templates/${def.key}`;
    const res = await fetch(url, {
      method: kind === "save" ? "PUT" : kind === "reset" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: kind === "save" ? JSON.stringify({ enabled: state.enabled, subject: state.subject, body: state.body }) : kind === "test" ? JSON.stringify({ key: def.key }) : undefined,
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Something went wrong" });
      return;
    }
    if (kind === "save") {
      setSaved(state);
      setState((s) => ({ ...s, isCustom: true }));
      setMsg({ ok: true, text: "Saved. New messages use this wording." });
    } else if (kind === "reset") {
      const fresh = { enabled: true, subject: def.subject ?? "", body: def.body, isCustom: false };
      setState(fresh);
      setSaved(fresh);
      setMsg({ ok: true, text: "Back to the built-in wording." });
    } else {
      setMsg({ ok: true, text: `Test queued for ${data.to}. Find it in the Delivery log.` });
    }
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-3">
        {!def.alwaysOn && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={state.enabled} onChange={(e) => { setState((s) => ({ ...s, enabled: e.target.checked })); setMsg(null); }} />
            Send this message
          </label>
        )}

        {def.channel === "email" && (
          <div>
            <label className="block text-xs font-medium mb-1">Subject</label>
            <input
              ref={subjectRef}
              value={state.subject}
              onFocus={() => setFocus("subject")}
              onChange={(e) => { setState((s) => ({ ...s, subject: e.target.value })); setMsg(null); }}
              className="input text-sm"
              maxLength={200}
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-1">{def.channel === "email" ? "Message" : "Text message"}</label>
          <textarea
            ref={bodyRef}
            value={state.body}
            onFocus={() => setFocus("body")}
            onChange={(e) => { setState((s) => ({ ...s, body: e.target.value })); setMsg(null); }}
            rows={def.channel === "email" ? 11 : 4}
            className="input text-sm font-mono leading-relaxed"
          />
          {sms && (
            <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-1">
              {sms.length} characters once filled in · about {sms.segments} text{sms.segments === 1 ? "" : "s"}
              {sms.unicode ? " (special characters make texts shorter)" : ""}
            </p>
          )}
        </div>

        <div>
          <div className="text-xs font-medium mb-1.5">Insert a detail</div>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <button key={v.key} type="button" title={v.label} onClick={() => insert(v.key)} className="text-[11px] px-2 py-1 rounded-md bg-surface dark:bg-ink-800 hover:bg-brand-light dark:hover:bg-brand/20 font-mono">
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </div>

        {bad.length > 0 && <p className="text-xs text-sla-breach">Not recognised: {bad.map((b) => `{{${b}}}`).join(", ")} — pick from the buttons above.</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={() => call("save")} disabled={!dirty || busy !== null || bad.length > 0} className="btn-primary text-xs">
            {busy === "save" ? "Saving…" : "Save wording"}
          </button>
          {state.isCustom && (
            <button onClick={() => call("reset")} disabled={busy !== null} className="btn-secondary text-xs">
              {busy === "reset" ? "Resetting…" : "Reset to default"}
            </button>
          )}
          {def.channel === "email" && (
            <button onClick={() => call("test")} disabled={busy !== null || dirty} title={dirty ? "Save first, then send a test" : "Send this email to yourself with sample ticket details"} className="btn-secondary text-xs">
              {busy === "test" ? "Sending…" : "Send me a test"}
            </button>
          )}
          {msg && <span className={`text-xs ${msg.ok ? "text-sla-ok" : "text-sla-breach"}`}>{msg.text}</span>}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium mb-1.5">Preview (sample ticket)</div>
        <div className="rounded-lg border border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 p-4 text-sm">
          {def.channel === "email" && <div className="font-semibold mb-2 pb-2 border-b border-line-light dark:border-line-dark">{renderTemplate(state.subject, vars) || "(no subject)"}</div>}
          <div className="whitespace-pre-wrap leading-relaxed">{renderTemplate(state.body, vars)}</div>
        </div>
        <p className="text-[11px] text-ink-950/40 dark:text-surface/40 mt-2">The real message uses each ticket&apos;s own details.</p>
      </div>
    </div>
  );
}
