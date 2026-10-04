"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Plus } from "lucide-react";
import { EVENT_CATALOG } from "@/lib/event-catalog";

export type ApiKeyItem = { id: string; name: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
export type WebhookItem = { id: string; url: string; events: string[]; active: boolean; secret: string; createdAt: string; failed24: number; sent24: number };

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function CopyBox({ value, note }: { value: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-4 mb-3 border-sla-warning/40 bg-sla-warning/5">
      <p className="text-xs font-medium text-sla-warning mb-1">{note}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono bg-surface dark:bg-ink-950 px-2 py-1.5 rounded overflow-x-auto">{value}</code>
        <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-1.5 rounded hover:bg-surface dark:hover:bg-ink-900" aria-label="Copy">
          {copied ? <Check size={14} className="text-sla-ok" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function ScopePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div className="flex gap-4 text-xs">
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.includes("read")} onChange={() => toggle("read")} /> Read <span className="text-ink-950/40 dark:text-surface/40">(look up tickets &amp; customers)</span></label>
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.includes("write")} onChange={() => toggle("write")} /> Write <span className="text-ink-950/40 dark:text-surface/40">(create tickets &amp; customers)</span></label>
    </div>
  );
}

export function ApiKeysPanel({ initialKeys }: { initialKeys: ApiKeyItem[] }) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(j.error ?? "Failed");
    setKeys((p) => [{ ...j.key, lastUsedAt: null, revokedAt: null, createdAt: j.key.createdAt }, ...p]);
    setRawKey(j.rawKey); setName(""); setScopes(["read"]); setShowForm(false);
    router.refresh();
  }
  async function setKeyScopes(id: string, next: string[]) {
    if (next.length === 0) return;
    const res = await fetch(`/api/admin/api-keys/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scopes: next }) });
    if (res.ok) setKeys((p) => p.map((k) => (k.id === id ? { ...k, scopes: next } : k)));
  }
  async function rename(id: string, current: string) {
    const n = window.prompt("New name for this key", current)?.trim();
    if (!n || n === current) return;
    const res = await fetch(`/api/admin/api-keys/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
    if (res.ok) setKeys((p) => p.map((k) => (k.id === id ? { ...k, name: n } : k)));
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this key? Anything using it stops working immediately.")) return;
    const res = await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
    if (res.ok) setKeys((p) => p.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">API keys</h2>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary text-xs"><Plus size={14} /> New key</button>
      </div>
      <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-3">One key per connected system, so you can revoke one without touching the others. Give a system only the permissions it needs.</p>
      {showForm && (
        <form onSubmit={create} className="card p-4 mb-3 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. Core Banking Sync" className="input" />
          <ScopePicker value={scopes} onChange={setScopes} />
          {error && <p className="text-xs text-sla-breach">{error}</p>}
          <button type="submit" className="btn-primary text-sm">Generate key</button>
        </form>
      )}
      {rawKey && <CopyBox value={rawKey} note="Copy this now — it won't be shown again. Send it as the X-API-Key header." />}
      <div className="card divide-y divide-line-light dark:divide-line-dark">
        {keys.map((k) => (
          <div key={k.id} className={`p-3 text-sm ${k.revokedAt ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{k.name}</div>
                <div className="text-xs text-ink-950/50 dark:text-surface/50">Created {fmt(k.createdAt)}{k.lastUsedAt ? ` · last used ${fmt(k.lastUsedAt)}` : " · never used"}</div>
              </div>
              {k.revokedAt ? <span className="pill-neutral">Revoked</span> : (
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => rename(k.id, k.name)} className="text-xs text-brand hover:underline">Rename</button>
                  <button onClick={() => revoke(k.id)} className="text-xs text-sla-breach hover:underline">Revoke</button>
                </div>
              )}
            </div>
            {!k.revokedAt && <div className="mt-2"><ScopePicker value={k.scopes} onChange={(v) => setKeyScopes(k.id, v)} /></div>}
          </div>
        ))}
        {keys.length === 0 && <p className="p-6 text-center text-sm text-ink-950/50 dark:text-surface/50">No API keys yet.</p>}
      </div>
    </section>
  );
}

function EventPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {EVENT_CATALOG.map((e) => (
        <label key={e.type} className="flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5" checked={value.includes(e.type)} onChange={(ev) => onChange(ev.target.checked ? [...value, e.type] : value.filter((x) => x !== e.type))} />
          <span><span className="font-mono">{e.type}</span><span className="block text-ink-950/50 dark:text-surface/50">{e.label}</span></span>
        </label>
      ))}
    </div>
  );
}

export function WebhooksPanel({ initialWebhooks }: { initialWebhooks: WebhookItem[] }) {
  const router = useRouter();
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [secretShown, setSecretShown] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [eUrl, setEUrl] = useState("");
  const [eEvents, setEEvents] = useState<string[]>([]);
  const mask = (s: string) => `${s.slice(0, 6)}${"•".repeat(10)}`;

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const res = await fetch("/api/admin/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, events }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(j.error ?? "Failed");
    setWebhooks((p) => [{ ...j.webhook, secret: mask(j.webhook.secret), failed24: 0, sent24: 0 }, ...p]);
    setSecretShown(j.webhook.secret); setUrl(""); setEvents([]); setShowForm(false); router.refresh();
  }
  async function patch(id: string, body: object, okMsg?: string) {
    const res = await fetch(`/api/admin/webhooks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setNote((p) => ({ ...p, [id]: j.error ?? "Failed" })); return false; }
    setWebhooks((p) => p.map((w) => (w.id === id ? { ...w, ...j.webhook, failed24: w.failed24, sent24: w.sent24 } : w)));
    if (j.newSecret) setSecretShown(j.newSecret);
    if (okMsg) setNote((p) => ({ ...p, [id]: okMsg }));
    return true;
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this webhook? Waiting deliveries for it will be dropped.")) return;
    await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
    setWebhooks((p) => p.filter((w) => w.id !== id));
  }
  async function sendTest(id: string) {
    setNote((p) => ({ ...p, [id]: "Sending…" }));
    const res = await fetch(`/api/admin/webhooks/${id}/test`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setNote((p) => ({ ...p, [id]: d.ok ? `Delivered (HTTP ${d.status})` : `Failed: ${d.error ?? d.status}` }));
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Webhooks</h2>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary text-xs"><Plus size={14} /> New webhook</button>
      </div>
      <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-3">CX360 pushes events to your other systems as they happen. Failed deliveries are retried for 24 hours and appear in the Deliveries tab, where you can re-send them.</p>
      {showForm && (
        <form onSubmit={create} className="card p-4 mb-3 space-y-3">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-system.example.com/webhooks/cx360" className="input" />
          <EventPicker value={events} onChange={setEvents} />
          {error && <p className="text-xs text-sla-breach">{error}</p>}
          <button type="submit" className="btn-primary text-sm">Create webhook</button>
        </form>
      )}
      {secretShown && <CopyBox value={secretShown} note="Signing secret — copy it now, it won't be shown again. Your system uses it to check each message really came from CX360." />}
      <div className="card divide-y divide-line-light dark:divide-line-dark">
        {webhooks.map((w) => (
          <div key={w.id} className="p-3 text-sm">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-mono text-xs truncate">{w.url}</span>
              <div className="flex items-center gap-2 shrink-0">
                {w.failed24 > 0 && <span className="pill-breach">{w.failed24} failing</span>}
                <button onClick={() => patch(w.id, { active: !w.active })} className={w.active ? "pill-ok" : "pill-neutral"}>{w.active ? "Active" : "Paused"}</button>
              </div>
            </div>
            <p className="text-xs text-ink-950/50 dark:text-surface/50 font-mono mb-1">{w.events.join(", ")}</p>
            <p className="text-[11px] text-ink-950/40 dark:text-surface/40 mb-2">Last 24h: {w.sent24} delivered · secret {w.secret}</p>
            {editing === w.id ? (
              <div className="space-y-2 mb-2 rounded-lg bg-surface dark:bg-ink-800 p-3">
                <input value={eUrl} onChange={(e) => setEUrl(e.target.value)} className="input !py-1.5 text-xs font-mono" />
                <EventPicker value={eEvents} onChange={setEEvents} />
                <div className="flex gap-2">
                  <button className="btn-primary text-xs" onClick={async () => { if (await patch(w.id, { url: eUrl, events: eEvents }, "Saved")) setEditing(null); }}>Save</button>
                  <button className="btn-secondary text-xs" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => sendTest(w.id)} className="text-xs text-brand hover:underline">Send test event</button>
              <button onClick={() => { setEditing(w.id); setEUrl(w.url); setEEvents(w.events); }} className="text-xs text-brand hover:underline">Edit</button>
              <button onClick={() => { if (window.confirm("Replace the signing secret? Your receiving system must be updated with the new one.")) patch(w.id, { rotateSecret: true }, "Secret replaced"); }} className="text-xs text-brand hover:underline">Replace secret</button>
              <button onClick={() => remove(w.id)} className="text-xs text-sla-breach hover:underline">Delete</button>
              {note[w.id] && <span className="text-xs text-ink-950/50 dark:text-surface/50">{note[w.id]}</span>}
            </div>
          </div>
        ))}
        {webhooks.length === 0 && <p className="p-6 text-center text-sm text-ink-950/50 dark:text-surface/50">No webhooks configured yet.</p>}
      </div>
    </section>
  );
}

export function ResendButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  async function go() {
    setState("busy");
    const res = await fetch(`/api/admin/webhook-deliveries/${id}/resend`, { method: "POST" });
    setState(res.ok ? "done" : "idle");
    router.refresh();
  }
  return <button onClick={go} disabled={state !== "idle"} className="text-xs text-brand hover:underline">{state === "done" ? "Queued" : state === "busy" ? "…" : "Re-send"}</button>;
}
