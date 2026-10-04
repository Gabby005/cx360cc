"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { HeaderEditor } from "@/components/notifications/delivery-client";
import { coreSecretsUsed, type AccountsEndpoint, type CoreBankingSettings, type Endpoint, type ProfileEndpoint, type TransactionsEndpoint } from "@/lib/core-banking/config";

type Msg = { ok: boolean; text: string } | null;
type Step = { name: string; ok: boolean; error?: string; understood?: unknown; rawStart?: string };

const EP: Endpoint = { url: "https://", method: "POST", headers: [{ name: "Authorization", value: "Bearer {{secret:CORE_API_KEY}}" }], contentType: "json", body: '{"customerNumber": "{{lookup}}"}' };
const ACCOUNTS: AccountsEndpoint = { ...EP, listPath: "", map: { productName: "", accountRef: "", status: "", balance: "", currency: "" }, defaultCurrency: "NGN" };
const TXNS: TransactionsEndpoint = { ...EP, body: '{"accountNumber": "{{accountRef}}", "count": {{limit}}}', listPath: "", map: { type: "", amount: "", currency: "", description: "", date: "" }, creditValues: "CR,C,Credit" };
const PROFILE: ProfileEndpoint = { ...EP, fields: {} };

const inp = "input mt-1 text-sm";
function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium">{label}</span>{children}{hint && <span className="block text-[11px] text-ink-950/50 dark:text-surface/50 mt-0.5">{hint}</span>}</label>;
}

function EndpointFields<T extends Endpoint>({ v, set }: { v: T; set: (n: T) => void }) {
  return (
    <>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <F label="Method"><select className={inp} value={v.method} onChange={(e) => set({ ...v, method: e.target.value as "GET" | "POST" })}><option>POST</option><option>GET</option></select></F>
        <F label="Address (https)"><input className={`${inp} font-mono`} value={v.url} onChange={(e) => set({ ...v, url: e.target.value })} /></F>
      </div>
      {v.method === "POST" && (
        <>
          <F label="Request format"><select className={inp} value={v.contentType} onChange={(e) => set({ ...v, contentType: e.target.value as Endpoint["contentType"] })}><option value="json">JSON</option><option value="xml">XML / SOAP</option><option value="form">Form fields</option></select></F>
          <F label="Request body" hint="Placeholders: {{lookup}} (core banking customer number) {{phone}} {{phone_intl}} {{email}} {{accountRef}} {{limit}} {{customerId}}"><textarea className={`${inp} font-mono text-xs`} rows={5} value={v.body} onChange={(e) => set({ ...v, body: e.target.value })} /></F>
        </>
      )}
      <HeaderEditor value={v.headers} onChange={(h) => set({ ...v, headers: h })} />
    </>
  );
}

function Path({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return <F label={label} hint={hint}><input className={`${inp} font-mono text-xs`} value={value} onChange={(e) => onChange(e.target.value)} /></F>;
}

function Section({ title, desc, on, onToggle, children }: { title: string; desc: string; on: boolean; onToggle: (b: boolean) => void; children: React.ReactNode }) {
  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs text-ink-950/50 dark:text-surface/50">{desc}</p></div>
        <label className="flex items-center gap-1.5 text-xs shrink-0"><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> Use</label>
      </div>
      {on && children}
    </section>
  );
}

export function CoreBankingClient({ initial, secrets }: { initial: CoreBankingSettings; secrets: Record<string, boolean> }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [secretState, setSecretState] = useState(secrets);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [t, setT] = useState({ lookup: "", phone: "", accountRef: "" });
  const [testing, setTesting] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const used = coreSecretsUsed(s);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/core-banking", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      const j = await res.json();
      if (!res.ok) setMsg({ ok: false, text: j.error ?? "Couldn't save" });
      else { setS(j.settings); setSaved(j.settings); setSecretState(j.secrets); setMsg({ ok: true, text: "Saved." }); router.refresh(); }
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); }
    setSaving(false);
  }
  async function test() {
    setTesting(true); setSteps(null); setTestErr(null);
    try {
      const res = await fetch("/api/admin/core-banking-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) });
      const j = await res.json();
      if (!res.ok) setTestErr(j.error ?? "Test failed"); else setSteps(j.steps);
    } catch { setTestErr("Couldn't reach the server."); }
    setTesting(false);
  }

  const fieldRows = Object.entries(s.profile?.fields ?? {});

  return (
    <div className="space-y-5 max-w-3xl">
      <p className="text-sm text-ink-950/60 dark:text-surface/60">
        Show live balances, account status and the last 5 transactions on the customer card, straight from the core banking system. CX360 only <b>reads</b>, keeps nothing (a 60-second memory cache only), pauses itself for a minute if the core keeps failing, and records in the audit log who viewed a customer. If the live lookup fails, agents see the stored data with a warning.
      </p>

      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div><h2 className="text-sm font-semibold">Live core banking</h2><p className="text-xs text-ink-950/50 dark:text-surface/50">Switch on only after the test below shows the right figures.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> {s.enabled ? "On" : "Off"}</label>
        </div>
        <F label="Customer-number field" hint="The customer detail that holds their core banking customer number (e.g. cif). It's sent as {{lookup}}. Add it to customers via the API or import; phone or account number can be used instead if the core supports it."><input className={inp} value={s.lookupKey} onChange={(e) => setS({ ...s, lookupKey: e.target.value })} /></F>
      </section>

      <Section title="1 · Accounts and balances" desc="Required. One call that returns the customer's accounts." on={!!s.accounts} onToggle={(b) => setS({ ...s, accounts: b ? ACCOUNTS : null, enabled: b ? s.enabled : false })}>
        {s.accounts && (() => { const a = s.accounts; const up = (n: AccountsEndpoint) => setS({ ...s, accounts: n }); return (
          <>
            <EndpointFields v={a} set={up} />
            <p className="text-xs font-medium pt-1">Where things are in the reply</p>
            <div className="grid grid-cols-2 gap-3">
              <Path label="List of accounts" hint="e.g. data.accounts" value={a.listPath} onChange={(v) => up({ ...a, listPath: v })} />
              <Path label="Account number" hint="e.g. accountNo" value={a.map.accountRef} onChange={(v) => up({ ...a, map: { ...a.map, accountRef: v } })} />
              <Path label="Account / product name" value={a.map.productName} onChange={(v) => up({ ...a, map: { ...a.map, productName: v } })} />
              <Path label="Balance" hint="e.g. availableBalance" value={a.map.balance} onChange={(v) => up({ ...a, map: { ...a.map, balance: v } })} />
              <Path label="Status" value={a.map.status} onChange={(v) => up({ ...a, map: { ...a.map, status: v } })} />
              <Path label="Currency" hint="Blank = use default" value={a.map.currency} onChange={(v) => up({ ...a, map: { ...a.map, currency: v } })} />
              <F label="Default currency"><input className={inp} maxLength={3} value={a.defaultCurrency} onChange={(e) => up({ ...a, defaultCurrency: e.target.value.toUpperCase() })} /></F>
            </div>
          </>); })()}
      </Section>

      <Section title="2 · Last 5 transactions" desc="One call per account, made when the agent opens that account." on={!!s.transactions} onToggle={(b) => setS({ ...s, transactions: b ? TXNS : null })}>
        {s.transactions && (() => { const x = s.transactions; const up = (n: TransactionsEndpoint) => setS({ ...s, transactions: n }); return (
          <>
            <EndpointFields v={x} set={up} />
            <p className="text-xs font-medium pt-1">Where things are in the reply</p>
            <div className="grid grid-cols-2 gap-3">
              <Path label="List of transactions" value={x.listPath} onChange={(v) => up({ ...x, listPath: v })} />
              <Path label="Amount" value={x.map.amount} onChange={(v) => up({ ...x, map: { ...x.map, amount: v } })} />
              <Path label="Date" value={x.map.date} onChange={(v) => up({ ...x, map: { ...x.map, date: v } })} />
              <Path label="Narration / description" value={x.map.description} onChange={(v) => up({ ...x, map: { ...x.map, description: v } })} />
              <Path label="Credit or debit" hint="Blank = negative amounts are debits" value={x.map.type} onChange={(v) => up({ ...x, map: { ...x.map, type: v } })} />
              <F label="Values meaning “money in”" hint="Comma separated"><input className={inp} value={x.creditValues} onChange={(e) => up({ ...x, creditValues: e.target.value })} /></F>
              <Path label="Currency" hint="Blank = account's currency" value={x.map.currency} onChange={(v) => up({ ...x, map: { ...x.map, currency: v } })} />
            </div>
          </>); })()}
      </Section>

      <Section title="3 · Customer details (BVN, date of birth, address…)" desc="Optional. Fills the “customer details” chosen in Admin → Customer summary fields." on={!!s.profile} onToggle={(b) => setS({ ...s, profile: b ? PROFILE : null })}>
        {s.profile && (() => { const p = s.profile; const up = (n: ProfileEndpoint) => setS({ ...s, profile: n }); return (
          <>
            <EndpointFields v={p} set={up} />
            <p className="text-xs font-medium pt-1">Where each detail is in the reply</p>
            <div className="space-y-2">
              {fieldRows.map(([k, v]) => (
                <div key={k} className="flex gap-2 items-center">
                  <code className="kbd w-28 shrink-0">{k}</code>
                  <input className="input !py-1.5 text-xs font-mono flex-1" value={v} onChange={(e) => up({ ...p, fields: { ...p.fields, [k]: e.target.value } })} placeholder="e.g. data.bvn" />
                  <button type="button" className="text-xs text-sla-breach" onClick={() => { const f = { ...p.fields }; delete f[k]; up({ ...p, fields: f }); }}>Remove</button>
                </div>
              ))}
              <AddField onAdd={(k) => up({ ...p, fields: { ...p.fields, [k]: "" } })} existing={fieldRows.map(([k]) => k)} />
              <p className="text-[11px] text-ink-950/50 dark:text-surface/50">Use the same names as in Customer summary fields (e.g. bvn, dob, address).</p>
            </div>
          </>); })()}
      </Section>

      {used.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold mb-2">Server variables these settings need</h2>
          <ul className="space-y-1.5 text-sm">
            {used.map((n) => { const k = secretState[n]; return (
              <li key={n} className="flex items-center gap-2">
                {k ? <CheckCircle2 size={15} className="text-sla-ok" /> : <CircleAlert size={15} className="text-sla-warning" />}
                <code className="kbd">CX360_{n}</code>
                <span className="text-xs text-ink-950/50 dark:text-surface/50">{k ? "set" : k === undefined ? "save to check" : "not set yet — add it in Netlify → Environment variables, then redeploy"}</span>
              </li>); })}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !dirty} className="btn-primary">{saving ? "Saving…" : "Save core banking settings"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-sla-ok" : "text-sla-breach"}`}>{msg.text}</span>}
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Test with a real customer {dirty && <span className="font-normal text-xs text-ink-950/50 dark:text-surface/50">(save first)</span>}</h2>
        <p className="text-xs text-ink-950/50 dark:text-surface/50">Type a customer&apos;s details as the core knows them. Each saved lookup runs once; you see what CX360 understood next to the start of the raw reply (long numbers are partly hidden). Nothing is stored.</p>
        <div className="grid grid-cols-3 gap-3">
          <F label="Customer number"><input className={inp} value={t.lookup} onChange={(e) => setT({ ...t, lookup: e.target.value })} /></F>
          <F label="Phone"><input className={inp} value={t.phone} onChange={(e) => setT({ ...t, phone: e.target.value })} /></F>
          <F label="Account number" hint="Blank = first account found"><input className={inp} value={t.accountRef} onChange={(e) => setT({ ...t, accountRef: e.target.value })} /></F>
        </div>
        <button onClick={test} disabled={testing || dirty} className="btn-secondary text-xs">{testing ? "Testing…" : "Run test"}</button>
        {testErr && <p className="text-xs text-sla-breach">{testErr}</p>}
        {steps?.map((st) => (
          <div key={st.name} className="rounded-lg bg-surface dark:bg-ink-800 p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">{st.ok ? <CheckCircle2 size={15} className="text-sla-ok" /> : <CircleAlert size={15} className="text-sla-breach" />}{st.name}</div>
            {st.error && <p className="text-sla-breach">{st.error}</p>}
            {st.understood !== undefined && <pre className="font-mono whitespace-pre-wrap break-all">{JSON.stringify(st.understood, null, 1)}</pre>}
            {st.rawStart && <details><summary className="cursor-pointer text-ink-950/50 dark:text-surface/50">Start of the raw reply</summary><pre className="font-mono whitespace-pre-wrap break-all mt-1">{st.rawStart}</pre></details>}
          </div>
        ))}
      </section>
    </div>
  );
}

function AddField({ onAdd, existing }: { onAdd: (k: string) => void; existing: string[] }) {
  const [k, setK] = useState("");
  const ok = /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k) && !existing.includes(k);
  return (
    <div className="flex gap-2">
      <input className="input !py-1.5 text-xs w-40" placeholder="field name, e.g. bvn" value={k} onChange={(e) => setK(e.target.value)} />
      <button type="button" disabled={!ok} className="btn-secondary text-xs" onClick={() => { onAdd(k); setK(""); }}>Add detail</button>
    </div>
  );
}
