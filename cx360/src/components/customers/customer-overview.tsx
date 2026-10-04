"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, Eye, EyeOff, ExternalLink, UserSearch } from "lucide-react";
import { STATUS_LABEL, STATUS_PILL } from "@/lib/case-status";

type Txn = { id: string; type: string; amount: number; currency: string; description: string; transactionDate: string };
type Account = {
  id: string;
  productName: string;
  accountRef: string | null;
  status: string;
  currency: string;
  balance: number | null;
  openedAt: string | null;
  transactions: Txn[] | null; // null = not loaded yet (live accounts load on click)
};
type ProfileField = { key: string; label: string; sensitive: boolean; value: string | null };
type Overview = {
  profile: ProfileField[];
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    segment: string | null;
    sentimentAvg: number | null;
    createdAt: string;
  };
  accounts: Account[];
  accountCount: number;
  source: "live" | "local";
  note: string | null;
  cases: {
    open: number;
    overdue: number;
    last30Days: number;
    recent: { id: string; caseNumber: string; subject: string; status: string; type: string; createdAt: string }[];
  };
  lastInteraction: { channel: string; direction: string; createdAt: string } | null;
};

const money = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const mask = (ref: string) => (ref.length > 4 ? "•".repeat(ref.length - 4) + ref.slice(-4) : ref);
const acctPill = (s: string) => {
  const v = s.toLowerCase();
  return v === "active" ? "pill-ok" : v === "dormant" || v === "inactive" ? "pill-warning" : "pill-breach";
};
const TYPE_LABEL: Record<string, string> = {
  COMPLAINT: "Complaint",
  SERVICE_REQUEST: "Request",
  INQUIRY: "Enquiry",
  INCIDENT: "Incident",
};

function sentimentLabel(v: number | null) {
  if (v === null) return null;
  if (v > 0.25) return { text: "Positive", cls: "pill-ok" };
  if (v < -0.25) return { text: "Negative", cls: "pill-breach" };
  return { text: "Neutral", cls: "pill-neutral" };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="text-ink-950/40 dark:text-surface/40 hover:text-brand"
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

export function CustomerOverview({ customerId }: { customerId: string | null }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAcct, setActiveAcct] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<string, Txn[] | "loading" | "error">>({});
  const [hidden, setHidden] = useState(false); // privacy toggle: masks balances + account numbers
  const [revealed, setRevealed] = useState<Set<string>>(new Set()); // sensitive profile fields the agent chose to show

  useEffect(() => {
    if (!customerId) {
      setData(null);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/customers/${customerId}/overview`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load customer");
        return r.json() as Promise<Overview>;
      })
      .then((d) => {
        setData(d);
        setRevealed(new Set());
        setLoaded({});
        setActiveAcct(d.accounts[0]?.id ?? null);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [customerId]);

  if (!customerId) {
    return (
      <div className="card p-8 text-center text-ink-950/50 dark:text-surface/50">
        <UserSearch size={28} className="mx-auto mb-3 opacity-60" />
        <p className="text-sm font-medium">Customer overview</p>
        <p className="text-xs mt-1 max-w-xs mx-auto">
          Search by name, phone, email or account number. Their accounts, balances, last 5 transactions and case
          history will appear here.
        </p>
      </div>
    );
  }
  if (loading && !data) return <div className="card p-6 text-sm text-ink-950/50 dark:text-surface/50">Loading customer…</div>;
  if (error) return <div className="card p-6 text-sm text-sla-breach">{error}</div>;
  if (!data) return null;

  const { customer, accounts, cases } = data;
  const sentiment = sentimentLabel(customer.sentimentAvg);
  const account = accounts.find((a) => a.id === activeAcct) ?? accounts[0];

  function pick(a: Account) {
    setActiveAcct(a.id);
    if (a.transactions === null && a.accountRef && !loaded[a.id]) {
      setLoaded((l) => ({ ...l, [a.id]: "loading" }));
      fetch(`/api/customers/${customer.id}/live-transactions?ref=${encodeURIComponent(a.accountRef)}`)
        .then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ transactions: Txn[] }>; })
        .then((j) => setLoaded((l) => ({ ...l, [a.id]: j.transactions })))
        .catch(() => setLoaded((l) => ({ ...l, [a.id]: "error" })));
    }
  }
  const accountTx: Txn[] | "loading" | "error" = !account ? [] : account.transactions ?? loaded[account.id] ?? "loading";

  // Total balance per currency (never add across currencies).
  const totals = new Map<string, number>();
  for (const a of accounts) if (a.balance !== null) totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.balance);

  const alerts: { text: string; cls: string }[] = [];
  if (cases.overdue > 0) alerts.push({ text: `${cases.overdue} open case${cases.overdue > 1 ? "s" : ""} past SLA`, cls: "pill-breach" });
  if (cases.last30Days >= 2) alerts.push({ text: `Repeat contact: ${cases.last30Days} cases in 30 days`, cls: "pill-warning" });
  if (accounts.some((a) => a.status.toLowerCase() !== "active")) alerts.push({ text: "Has a non-active account", cls: "pill-warning" });

  return (
    <div className={`card p-7 space-y-7 text-[15px] ${loading ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="avatar w-16 h-16 text-lg">
            {customer.firstName[0]}
            {customer.lastName[0]}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-semibold truncate">
                {customer.firstName} {customer.lastName}
              </h2>
              {customer.segment && <span className="pill-brand">{customer.segment}</span>}
              {sentiment && <span className={sentiment.cls}>{sentiment.text}</span>}
            </div>
            <div className="text-sm text-ink-950/60 dark:text-surface/60 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
              {customer.phone && (
                <span className="inline-flex items-center gap-1">
                  {customer.phone} <CopyButton value={customer.phone} label="phone" />
                </span>
              )}
              {customer.email && <span className="truncate">{customer.email}</span>}
              <span>Customer since {date(customer.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            title={hidden ? "Show balances and account numbers" : "Hide balances and account numbers"}
            className="btn-ghost !px-2 !py-1"
          >
            {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <Link href={`/customers/${customer.id}`} target="_blank" title="Open full profile" className="btn-ghost !px-2 !py-1">
            <ExternalLink size={14} />
          </Link>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {alerts.map((a) => (
            <span key={a.text} className={a.cls}>
              {a.text}
            </span>
          ))}
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <Stat label="Open cases" value={String(cases.open)} />
        <Stat label="Cases (30 days)" value={String(cases.last30Days)} />
        <Stat
          label="Last contact"
          value={data.lastInteraction ? date(data.lastInteraction.createdAt) : "—"}
          sub={data.lastInteraction ? data.lastInteraction.channel.toLowerCase() : undefined}
        />
      </div>

      {/* Customer details chosen by the Super Admin (BVN, date of birth, address…) */}
      {data.profile.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold tracking-wide text-ink-950/50 dark:text-surface/50 mb-3">CUSTOMER DETAILS</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {data.profile.map((f) => {
              const show = !f.sensitive || (!hidden && revealed.has(f.key));
              return (
                <div key={f.key} className="min-w-0">
                  <dt className="text-xs text-ink-950/50 dark:text-surface/50">{f.label}</dt>
                  <dd className="text-[15px] font-medium break-words flex items-center gap-1.5">
                    {f.value === null ? (
                      <span className="text-ink-950/35 dark:text-surface/35">—</span>
                    ) : show ? (
                      <>
                        {f.value}
                        {f.sensitive && (
                          <button type="button" title="Hide" onClick={() => setRevealed((r) => { const n = new Set(r); n.delete(f.key); return n; })} className="text-ink-950/40 dark:text-surface/40 hover:text-brand">
                            <EyeOff size={13} />
                          </button>
                        )}
                        <CopyButton value={f.value} label={f.label} />
                      </>
                    ) : (
                      <>
                        <span className="font-mono">{mask(f.value)}</span>
                        {!hidden && (
                          <button type="button" title="Show" onClick={() => setRevealed((r) => new Set(r).add(f.key))} className="text-ink-950/40 dark:text-surface/40 hover:text-brand">
                            <Eye size={13} />
                          </button>
                        )}
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {/* Accounts */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-[13px] font-semibold tracking-wide text-ink-950/50 dark:text-surface/50">
            ACCOUNTS ({data.accountCount})
          </h3>
          {totals.size > 0 && (
            <div className="text-sm text-ink-950/60 dark:text-surface/60 font-mono">
              Total: {[...totals.entries()].map(([c, n]) => (hidden ? `${c} ••••••` : money(n, c))).join(" · ")}
            </div>
          )}
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50">No accounts on file for this customer.</p>
        ) : (
          <div className="space-y-1.5">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a)}
                className={`w-full text-left rounded-xl border px-4 py-3.5 flex items-center justify-between gap-3 transition-colors ${
                  a.id === account?.id
                    ? "border-brand bg-brand-light/40 dark:bg-brand/10"
                    : "border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-base font-medium truncate flex items-center gap-2">
                    {a.productName} <span className={acctPill(a.status)}>{a.status}</span>
                  </div>
                  <div className="text-sm font-mono text-ink-950/50 dark:text-surface/50 flex items-center gap-1.5 mt-0.5">
                    {a.accountRef ? (hidden ? mask(a.accountRef) : a.accountRef) : "No account number"}
                    {a.accountRef && !hidden && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <CopyButton value={a.accountRef} label="account number" />
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-lg font-mono font-semibold shrink-0">
                  {a.balance === null ? "—" : hidden ? `${a.currency} ••••••` : money(a.balance, a.currency)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Last 5 transactions for the selected account (KYC checks) */}
      {account && (
        <div>
          <h3 className="text-[13px] font-semibold tracking-wide text-ink-950/50 dark:text-surface/50 mb-2">
            LAST 5 TRANSACTIONS · {account.productName.toUpperCase()}
          </h3>
          {accountTx === "loading" ? (
            <p className="text-sm text-ink-950/50 dark:text-surface/50">Loading transactions…</p>
          ) : accountTx === "error" ? (
            <p className="text-sm text-sla-breach">Couldn&apos;t load transactions from the core banking system. Click the account to try again.</p>
          ) : accountTx.length === 0 ? (
            <p className="text-sm text-ink-950/50 dark:text-surface/50">No transaction history.</p>
          ) : (
            <ul className="divide-y divide-line-light dark:divide-line-dark">
              {accountTx.map((t) => {
                const credit = t.type === "credit";
                return (
                  <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          credit ? "bg-sla-ok/10 text-sla-ok" : "bg-sla-breach/10 text-sla-breach"
                        }`}
                      >
                        {credit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[15px] truncate">{t.description}</div>
                        <div className="text-[13px] text-ink-950/50 dark:text-surface/50">{date(t.transactionDate)}</div>
                      </div>
                    </div>
                    <div className={`text-[15px] font-mono font-medium shrink-0 ${credit ? "text-sla-ok" : ""}`}>
                      {hidden ? "••••••" : `${credit ? "+" : "−"}${money(t.amount, t.currency)}`}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[11px] text-ink-950/40 dark:text-surface/40 mt-2">
            Read-only. {data.source === "live" ? "Live from the core banking system." : "Stored data, not live — may not match the core banking system."}
          </p>
          {data.note && <p className="text-xs text-sla-warning mt-1">{data.note}</p>}
        </div>
      )}

      {/* Recent cases */}
      <div>
        <h3 className="text-[13px] font-semibold tracking-wide text-ink-950/50 dark:text-surface/50 mb-2">RECENT CASES</h3>
        {cases.recent.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50">No previous cases — first contact.</p>
        ) : (
          <ul className="space-y-1">
            {cases.recent.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cases/${c.id}`}
                  target="_blank"
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-surface dark:hover:bg-ink-800"
                >
                  <div className="min-w-0">
                    <div className="text-[15px] truncate">{c.subject}</div>
                    <div className="text-[13px] text-ink-950/50 dark:text-surface/50">
                      {c.caseNumber} · {TYPE_LABEL[c.type] ?? c.type} · {date(c.createdAt)}
                    </div>
                  </div>
                  <span className={STATUS_PILL[c.status] ?? "pill-neutral"}>{STATUS_LABEL[c.status] ?? c.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface dark:bg-ink-800 px-3 py-3.5">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-ink-950/50 dark:text-surface/50 mt-0.5">{sub ? `${label} · ${sub}` : label}</div>
    </div>
  );
}
