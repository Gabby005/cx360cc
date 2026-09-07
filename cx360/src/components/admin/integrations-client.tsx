"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Plus } from "lucide-react";

const EVENT_TYPES = [
  "customer.created",
  "case.created",
  "case.assigned",
  "case.resolved",
  "sla.warning",
  "sla.breached",
  "complaint.created",
  "feedback.received",
];

type ApiKeyItem = { id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
type WebhookItem = { id: string; url: string; events: string[]; active: boolean; secret: string; createdAt: string };

const CONNECTORS = [
  { name: "Core Banking (ISO 20022)", category: "Core Banking" },
  { name: "Twilio Voice & SMS", category: "Telephony" },
  { name: "WhatsApp Business API", category: "Messaging" },
  { name: "SendGrid / SES Email", category: "Email" },
  { name: "SAP ERP", category: "ERP" },
  { name: "Salesforce", category: "CRM Sync" },
];

export function IntegrationsClient({
  initialKeys,
  initialWebhooks,
}: {
  initialKeys: ApiKeyItem[];
  initialWebhooks: WebhookItem[];
}) {
  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Integration hub</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        API keys and webhooks below are live and call the real{" "}
        <code className="kbd">/api/v1/**</code> and event-dispatch infrastructure. The connector marketplace is a
        catalog of what CX360 is built to integrate with — wiring each one live needs that provider's OAuth
        credentials, which is Phase 2.
      </p>

      <ApiKeysPanel initialKeys={initialKeys} />
      <WebhooksPanel initialWebhooks={initialWebhooks} />
      <ConnectorMarketplace />
    </div>
  );
}

function ApiKeysPanel({ initialKeys }: { initialKeys: ApiKeyItem[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
      setError(msg);
      return;
    }
    const { key, rawKey: raw } = await res.json();
    setKeys((prev) => [{ ...key, lastUsedAt: null, revokedAt: null }, ...prev]);
    setRawKey(raw);
    setName("");
  }

  async function revoke(id: string) {
    await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">API keys</h2>
        <button
          onClick={() => { setShowForm((v) => !v); setRawKey(null); }}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-brand text-white font-medium hover:bg-brand-dark"
        >
          <Plus size={14} /> New key
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card p-4 mb-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name, e.g. Core Banking Sync"
            className="w-full px-2 py-1.5 rounded border border-line-light dark:border-line-dark bg-surface dark:bg-ink-900 text-sm"
          />
          {error && <p className="text-xs text-sla-breach">{error}</p>}
          <button type="submit" className="text-sm px-3 py-1.5 rounded bg-brand text-white font-medium hover:bg-brand-dark">
            Generate key
          </button>
        </form>
      )}

      {rawKey && (
        <div className="card p-4 mb-3 border-sla-warning/40 bg-sla-warning/5">
          <p className="text-xs font-medium text-sla-warning mb-1">
            Copy this now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-surface dark:bg-ink-950 px-2 py-1.5 rounded overflow-x-auto">
              {rawKey}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(rawKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="p-1.5 rounded hover:bg-surface dark:hover:bg-ink-900"
            >
              {copied ? <Check size={14} className="text-sla-ok" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-2">
            Use it as <code className="kbd">X-API-Key: {"<key>"}</code> against{" "}
            <code className="kbd">/api/v1/customers</code> and <code className="kbd">/api/v1/cases</code>.
          </p>
        </div>
      )}

      <div className="card divide-y divide-line-light dark:divide-line-dark">
        {keys.map((k) => (
          <div key={k.id} className="p-3 flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{k.name}</div>
              <div className="text-xs text-ink-950/50 dark:text-surface/50">
                Created {new Date(k.createdAt).toLocaleDateString()}
                {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
              </div>
            </div>
            {k.revokedAt ? (
              <span className="pill-neutral">Revoked</span>
            ) : (
              <button onClick={() => revoke(k.id)} className="text-xs text-sla-breach hover:underline">
                Revoke
              </button>
            )}
          </div>
        ))}
        {keys.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-950/50 dark:text-surface/50">No API keys yet.</p>
        )}
      </div>
    </section>
  );
}

function WebhooksPanel({ initialWebhooks }: { initialWebhooks: WebhookItem[] }) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim() || events.length === 0) return setError("URL and at least one event are required.");
    const res = await fetch("/api/admin/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, events }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
      setError(msg);
      return;
    }
    const { webhook } = await res.json();
    setWebhooks((prev) => [{ ...webhook, secret: `${webhook.secret.slice(0, 6)}${"•".repeat(10)}` }, ...prev]);
    setUrl("");
    setEvents([]);
    setShowForm(false);
  }

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/admin/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, active: !active } : w)));
  }

  async function remove(id: string) {
    await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  async function sendTest(id: string) {
    setTestResult((prev) => ({ ...prev, [id]: "Sending…" }));
    const res = await fetch(`/api/admin/webhooks/${id}/test`, { method: "POST" });
    const data = await res.json();
    setTestResult((prev) => ({
      ...prev,
      [id]: data.ok ? `Delivered (HTTP ${data.status})` : `Failed: ${data.error ?? data.status}`,
    }));
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Webhooks</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-brand text-white font-medium hover:bg-brand-dark"
        >
          <Plus size={14} /> New webhook
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card p-4 mb-3 space-y-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-system.example.com/webhooks/cx360"
            className="w-full px-2 py-1.5 rounded border border-line-light dark:border-line-dark bg-surface dark:bg-ink-900 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((evt) => (
              <label key={evt} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={events.includes(evt)}
                  onChange={(e) =>
                    setEvents((prev) => (e.target.checked ? [...prev, evt] : prev.filter((x) => x !== evt)))
                  }
                />
                <span className="font-mono">{evt}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-sla-breach">{error}</p>}
          <button type="submit" className="text-sm px-3 py-1.5 rounded bg-brand text-white font-medium hover:bg-brand-dark">
            Create webhook
          </button>
        </form>
      )}

      <div className="card divide-y divide-line-light dark:divide-line-dark">
        {webhooks.map((w) => (
          <div key={w.id} className="p-3 text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs truncate max-w-[280px]">{w.url}</span>
              <button
                onClick={() => toggle(w.id, w.active)}
                className={w.active ? "pill-ok shrink-0" : "pill-neutral shrink-0"}
              >
                {w.active ? "Active" : "Paused"}
              </button>
            </div>
            <p className="text-xs text-ink-950/50 dark:text-surface/50 font-mono mb-2">{w.events.join(", ")}</p>
            <div className="flex items-center gap-3">
              <button onClick={() => sendTest(w.id)} className="text-xs text-brand hover:underline">
                Send test event
              </button>
              <button onClick={() => remove(w.id)} className="text-xs text-sla-breach hover:underline">
                Delete
              </button>
              {testResult[w.id] && (
                <span className="text-xs text-ink-950/50 dark:text-surface/50">{testResult[w.id]}</span>
              )}
            </div>
          </div>
        ))}
        {webhooks.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-950/50 dark:text-surface/50">No webhooks configured yet.</p>
        )}
      </div>
    </section>
  );
}

function ConnectorMarketplace() {
  return (
    <section>
      <h2 className="text-sm font-semibold mb-2">Connector marketplace</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CONNECTORS.map((c) => (
          <div key={c.name} className="card p-3 flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-ink-950/50 dark:text-surface/50">{c.category}</div>
            </div>
            <span className="pill-neutral">Phase 2</span>
          </div>
        ))}
      </div>
    </section>
  );
}
