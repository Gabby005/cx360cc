"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Plus, Trash2 } from "lucide-react";
import { secretsUsed, type DeliverySettings, type EmailConfig, type SmsConfig } from "@/lib/delivery/config";

type Msg = { ok: boolean; text: string } | null;

const SMS_DEFAULT: SmsConfig = {
  provider: "http", url: "https://", method: "POST", contentType: "json",
  headers: [{ name: "Authorization", value: "Bearer {{secret:SMS_API_KEY}}" }],
  body: '{"to": "{{to}}", "from": "{{senderId}}", "message": "{{message}}"}',
  senderId: "", phoneFormat: "digits", countryCode: "234", successContains: "",
};
const EMAIL_HTTP_DEFAULT: EmailConfig = {
  provider: "http", url: "https://", contentType: "json",
  headers: [{ name: "Authorization", value: "Bearer {{secret:EMAIL_API_KEY}}" }],
  body: '{"from": "{{sender}}", "to": {{to_json}}, "cc": {{cc_json}}, "subject": "{{subject}}", "text": "{{message}}"}',
  sender: "", fromName: "", successContains: "",
};
const GRAPH_DEFAULT: EmailConfig = { provider: "graph", azureTenantId: "", clientId: "", sender: "", fromName: "" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-950/50 dark:text-surface/50 mt-0.5">{hint}</span>}
    </label>
  );
}

function Headers({ value, onChange }: { value: { name: string; value: string }[]; onChange: (v: { name: string; value: string }[]) => void }) {
  return (
    <div>
      <span className="text-xs font-medium">Headers</span>
      <div className="space-y-1.5 mt-1">
        {value.map((h, i) => (
          <div key={i} className="flex gap-2">
            <input className="input !py-1.5 text-xs w-40" placeholder="Name" value={h.name} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className="input !py-1.5 text-xs flex-1 font-mono" placeholder="Value, e.g. Bearer {{secret:SMS_API_KEY}}" value={h.value} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="p-1.5 text-ink-950/40 hover:text-sla-breach" aria-label="Remove header"><Trash2 size={14} /></button>
          </div>
        ))}
        {value.length < 10 && (
          <button type="button" onClick={() => onChange([...value, { name: "", value: "" }])} className="text-xs text-brand hover:underline flex items-center gap-1"><Plus size={12} /> Add header</button>
        )}
      </div>
    </div>
  );
}

export { Headers as HeaderEditor };

function TestBox({ channel, disabled }: { channel: "email" | "sms"; disabled: boolean }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function send() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/delivery-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, to }) });
      const j = await res.json();
      setMsg(res.ok && j.ok ? { ok: true, text: "Sent — check the inbox / phone." } : { ok: false, text: j.error ?? "Failed" });
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); }
    setBusy(false);
  }
  return (
    <div className="rounded-lg bg-surface dark:bg-ink-800 p-3">
      <p className="text-xs font-medium mb-2">Send a test {disabled && <span className="font-normal text-ink-950/50 dark:text-surface/50">(save first)</span>}</p>
      <div className="flex gap-2">
        <input className="input !py-1.5 text-xs flex-1" placeholder={channel === "email" ? "you@bank.com" : "08031234567"} value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" onClick={send} disabled={busy || disabled || !to} className="btn-secondary text-xs">{busy ? "Sending…" : "Send test"}</button>
      </div>
      {msg && <p className={`text-xs mt-2 ${msg.ok ? "text-sla-ok" : "text-sla-breach"}`}>{msg.text}</p>}
    </div>
  );
}

export function DeliveryClient({ initial, secrets }: { initial: DeliverySettings; secrets: Record<string, boolean> }) {
  const router = useRouter();
  const [s, setS] = useState<DeliverySettings>(initial);
  const [saved, setSaved] = useState<DeliverySettings>(initial);
  const [secretState, setSecretState] = useState(secrets);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/delivery-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      const j = await res.json();
      if (!res.ok) setMsg({ ok: false, text: j.error ?? "Couldn't save" });
      else { setS(j.settings); setSaved(j.settings); setSecretState(j.secrets); setMsg({ ok: true, text: "Saved." }); router.refresh(); }
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); }
    setSaving(false);
  }

  const used = secretsUsed(s);
  const em = s.email, sm = s.sms;
  const inputCls = "input mt-1 text-sm";

  return (
    <div className="space-y-5 max-w-3xl">
      <p className="text-sm text-ink-950/60 dark:text-surface/60">
        Connect CX360 to the bank&apos;s own SMS gateway and email. Passwords and API keys are <b>never typed here</b> — write <code className="kbd">{"{{secret:NAME}}"}</code> where one is needed, and ask whoever manages Netlify to add a server variable called <code className="kbd">CX360_NAME</code> with the real value.
      </p>

      {/* SMS */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">SMS</h2>
          <select className="input !py-1.5 text-xs w-56" value={sm.provider} onChange={(e) => setS({ ...s, sms: e.target.value === "http" ? (saved.sms.provider === "http" ? saved.sms : SMS_DEFAULT) : { provider: "none" } })}>
            <option value="none">Not connected</option>
            <option value="http">Bank SMS gateway (web address)</option>
          </select>
        </div>
        {sm.provider === "http" && (
          <>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <Field label="Method"><select className={inputCls} value={sm.method} onChange={(e) => setS({ ...s, sms: { ...sm, method: e.target.value as "POST" | "GET" } })}><option>POST</option><option>GET</option></select></Field>
              <Field label="Gateway address (https)"><input className={`${inputCls} font-mono`} value={sm.url} onChange={(e) => setS({ ...s, sms: { ...sm, url: e.target.value } })} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sender ID" hint="Name shown to the customer"><input className={inputCls} maxLength={20} value={sm.senderId} onChange={(e) => setS({ ...s, sms: { ...sm, senderId: e.target.value } })} /></Field>
              <Field label="Phone format" hint="How the gateway wants numbers"><select className={inputCls} value={sm.phoneFormat} onChange={(e) => setS({ ...s, sms: { ...sm, phoneFormat: e.target.value as "digits" | "plus" | "asis" } })}><option value="digits">2348031234567</option><option value="plus">+2348031234567</option><option value="asis">As stored</option></select></Field>
              <Field label="Country code"><input className={inputCls} value={sm.countryCode} onChange={(e) => setS({ ...s, sms: { ...sm, countryCode: e.target.value } })} /></Field>
            </div>
            {sm.method === "POST" && (
              <>
                <Field label="Message format"><select className={inputCls} value={sm.contentType} onChange={(e) => setS({ ...s, sms: { ...sm, contentType: e.target.value as "json" | "form" } })}><option value="json">JSON</option><option value="form">Form fields (a=1&amp;b=2)</option></select></Field>
                <Field label="Request body" hint="Use {{to}} {{message}} {{senderId}} where the gateway expects them."><textarea className={`${inputCls} font-mono text-xs`} rows={4} value={sm.body} onChange={(e) => setS({ ...s, sms: { ...sm, body: e.target.value } })} /></Field>
              </>
            )}
            <Headers value={sm.headers} onChange={(h) => setS({ ...s, sms: { ...sm, headers: h } })} />
            <Field label="Success check (optional)" hint="If the gateway always answers 200, put a word its success reply contains, e.g. “queued”."><input className={inputCls} value={sm.successContains} onChange={(e) => setS({ ...s, sms: { ...sm, successContains: e.target.value } })} /></Field>
          </>
        )}
        <TestBox channel="sms" disabled={dirty || sm.provider === "none"} />
      </section>

      {/* Email */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Email</h2>
          <select className="input !py-1.5 text-xs w-56" value={em.provider} onChange={(e) => {
            const v = e.target.value;
            setS({ ...s, email: v === "none" ? { provider: "none" } : v === "graph" ? (saved.email.provider === "graph" ? saved.email : GRAPH_DEFAULT) : (saved.email.provider === "http" ? saved.email : EMAIL_HTTP_DEFAULT) });
          }}>
            <option value="none">Not connected</option>
            <option value="graph">Microsoft 365 / Exchange Online</option>
            <option value="http">Bank email gateway (web address)</option>
          </select>
        </div>
        {em.provider === "graph" && (
          <>
            <p className="text-xs text-ink-950/60 dark:text-surface/60">IT registers an app in Microsoft Entra ID with the <b>Mail.Send</b> application permission, then gives you these three values. The app&apos;s client secret goes in Netlify as <code className="kbd">CX360_GRAPH_CLIENT_SECRET</code>.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Directory (tenant) ID"><input className={`${inputCls} font-mono text-xs`} value={em.azureTenantId} onChange={(e) => setS({ ...s, email: { ...em, azureTenantId: e.target.value } })} /></Field>
              <Field label="Application (client) ID"><input className={`${inputCls} font-mono text-xs`} value={em.clientId} onChange={(e) => setS({ ...s, email: { ...em, clientId: e.target.value } })} /></Field>
              <Field label="Send from (mailbox)" hint="e.g. customercare@bank.com"><input className={inputCls} value={em.sender} onChange={(e) => setS({ ...s, email: { ...em, sender: e.target.value } })} /></Field>
              <Field label="Display name (optional)"><input className={inputCls} value={em.fromName} onChange={(e) => setS({ ...s, email: { ...em, fromName: e.target.value } })} /></Field>
            </div>
          </>
        )}
        {em.provider === "http" && (
          <>
            <Field label="Gateway address (https)"><input className={`${inputCls} font-mono`} value={em.url} onChange={(e) => setS({ ...s, email: { ...em, url: e.target.value } })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Send from (address)"><input className={inputCls} value={em.sender} onChange={(e) => setS({ ...s, email: { ...em, sender: e.target.value } })} /></Field>
              <Field label="Display name (optional)"><input className={inputCls} value={em.fromName} onChange={(e) => setS({ ...s, email: { ...em, fromName: e.target.value } })} /></Field>
            </div>
            <Field label="Message format"><select className={inputCls} value={em.contentType} onChange={(e) => setS({ ...s, email: { ...em, contentType: e.target.value as "json" | "form" } })}><option value="json">JSON</option><option value="form">Form fields</option></select></Field>
            <Field label="Request body" hint="Placeholders: {{to}} {{to_json}} {{cc}} {{cc_json}} {{subject}} {{message}} {{sender}} {{fromName}}"><textarea className={`${inputCls} font-mono text-xs`} rows={4} value={em.body} onChange={(e) => setS({ ...s, email: { ...em, body: e.target.value } })} /></Field>
            <Headers value={em.headers} onChange={(h) => setS({ ...s, email: { ...em, headers: h } })} />
            <Field label="Success check (optional)"><input className={inputCls} value={em.successContains} onChange={(e) => setS({ ...s, email: { ...em, successContains: e.target.value } })} /></Field>
          </>
        )}
        <TestBox channel="email" disabled={dirty || em.provider === "none"} />
      </section>

      {/* Secrets */}
      {used.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold mb-2">Server variables these settings need</h2>
          <ul className="space-y-1.5 text-sm">
            {used.map((n) => {
              const known = secretState[n];
              return (
                <li key={n} className="flex items-center gap-2">
                  {known ? <CheckCircle2 size={15} className="text-sla-ok" /> : <CircleAlert size={15} className="text-sla-warning" />}
                  <code className="kbd">CX360_{n}</code>
                  <span className="text-xs text-ink-950/50 dark:text-surface/50">{known ? "set" : known === undefined ? "save to check" : "not set yet — add it in Netlify → Site settings → Environment variables, then redeploy"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !dirty} className="btn-primary">{saving ? "Saving…" : "Save delivery settings"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-sla-ok" : "text-sla-breach"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-ink-950/50 dark:text-surface/50">Once saved, queued messages are sent within a minute. Failed sends retry automatically (1, 5, 15 then 60 minutes) before being marked failed.</p>
    </div>
  );
}
