"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Plus, Send, PhoneCall, Search, ArrowUpDown, AlertCircle } from "lucide-react";
import { ChannelBadge } from "@/components/channels/channel-icon";
import { CHANNEL_ORDER, CHANNEL_COLOR, channelLabel } from "@/lib/channel-ui";
import { CaseCodeSelect } from "@/components/cases/case-code-select";
import { TransactionalToggle, UnitEscalationField } from "@/components/cases/transactional-fields";
import { CASE_STATUSES, STATUS_LABEL, statusRequiresUnit } from "@/lib/case-status";

const CHANNELS = CHANNEL_ORDER;
/** Channels CX360 can really send a reply on; the rest are recorded only. */
const SENDABLE = new Set(["EMAIL", "SMS", "WHATSAPP", "INSTAGRAM", "MESSENGER", "X"]);

const ageMins = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
const fmtAge = (m: number) => (m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`);
const ageTone = (m: number) => (m >= 240 ? "text-sla-breach" : m >= 60 ? "text-sla-warning" : "text-ink-950/40 dark:text-surface/40");

type Item = {
  id: string;
  channel: string;
  status: string;
  summary: string | null;
  createdAt: string;
  caseId: string | null;
  contact?: string | null;
  subject?: string | null;
  customer: { id: string; firstName: string; lastName: string; segment: string | null; sentimentAvg: number | null; email?: string | null; phone?: string | null };
  agent: { id: string; name: string } | null;
};

type ThreadMsg = { id: string; direction: string; summary: string | null; createdAt: string; channel: string };

export function InboxClient({ initialItems, customers, initialChannel = "all" }: { initialItems: Item[]; customers: { id: string; firstName: string; lastName: string }[]; initialChannel?: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [channelFilter, setChannelFilter] = useState<string>(initialChannel);
  const [query, setQuery] = useState("");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [showSimulate, setShowSimulate] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        (channelFilter === "all" || i.channel === channelFilter) &&
        (!q || `${i.customer.firstName} ${i.customer.lastName} ${i.summary ?? ""} ${i.contact ?? ""}`.toLowerCase().includes(q))
    );
    return oldestFirst ? [...list].reverse() : list;
  }, [items, channelFilter, query, oldestFirst]);
  const perChannel = useMemo(() => {
    const m = new Map<string, { n: number; oldest: number }>();
    for (const i of items) {
      const e = m.get(i.channel) ?? { n: 0, oldest: 0 };
      e.n++;
      e.oldest = Math.max(e.oldest, ageMins(i.createdAt));
      m.set(i.channel, e);
    }
    return m;
  }, [items]);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  async function selectItem(id: string) {
    setSelectedId(id);
    setLoadingThread(true);
    const res = await fetch(`/api/inbox/${id}`);
    const data = await res.json();
    setThread(data.thread ?? []);
    setLoadingThread(false);
  }

  function refreshQueue() {
    router.refresh();
    // Optimistically pull the resolved item out of the NEW/IN_PROGRESS queue
    // view; the server component will reconcile on next navigation/refresh.
  }

  return (
    <div className="h-full flex flex-col">
      {/* Channel tiles — click to filter the queue */}
      <div className="px-4 py-3 border-b border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-11 gap-2">
        <button
          onClick={() => setChannelFilter("all")}
          className={`rounded-lg border px-3 py-2 text-left transition ${channelFilter === "all" ? "border-brand bg-brand-light/50 dark:bg-brand/10" : "border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800"}`}
        >
          <div className="text-[11px] text-ink-950/50 dark:text-surface/50">All channels</div>
          <div className="text-lg font-semibold font-mono leading-tight">{items.length}</div>
        </button>
        {CHANNELS.filter((c) => c !== "SOCIAL" || perChannel.has(c)).map((c) => {
          const e = perChannel.get(c);
          const active = channelFilter === c;
          return (
            <button
              key={c}
              onClick={() => setChannelFilter(active ? "all" : c)}
              style={active ? { borderColor: CHANNEL_COLOR[c] } : undefined}
              className={`rounded-lg border px-3 py-2 text-left transition ${active ? "bg-brand-light/50 dark:bg-brand/10" : "border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800"} ${e ? "" : "opacity-60"}`}
            >
              <div className="flex items-center gap-1.5">
                <ChannelBadge channel={c} size={20} />
                <span className="text-[11px] text-ink-950/60 dark:text-surface/60 truncate">{channelLabel(c)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-semibold font-mono leading-tight">{e?.n ?? 0}</span>
                {e && <span className={`text-[10px] font-mono ${ageTone(e.oldest)}`}>oldest {fmtAge(e.oldest)}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr_340px]">
      {/* Queue pane */}
      <div className="bg-surface-raised dark:bg-ink-900 border-r border-line-light dark:border-line-dark overflow-y-auto flex flex-col">
        <div className="px-4 py-4 border-b border-line-light dark:border-line-dark">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-sm font-semibold">Inbox</h1>
            <button
              onClick={() => setShowSimulate((v) => !v)}
              title="Simulate an incoming message (stand-in for a real channel webhook)"
              className="w-7 h-7 rounded-full grid place-items-center text-ink-950/50 dark:text-surface/50 hover:bg-ink-950/5 dark:hover:bg-surface/10 hover:text-brand"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-950/40 dark:text-surface/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, number or text" className="input !pl-8 !py-1.5 text-xs" />
            </div>
            <button onClick={() => setOldestFirst((v) => !v)} title={oldestFirst ? "Showing oldest first" : "Showing newest first"} className="btn-secondary !px-2.5 !py-1.5 text-xs"><ArrowUpDown size={13} /></button>
          </div>
        </div>

        {showSimulate && (
          <SimulateForm
            customers={customers}
            onCreated={(item) => {
              setItems((prev) => [item, ...prev]);
              setShowSimulate(false);
            }}
          />
        )}

        <ul className="flex-1">
          {filtered.map((item) => {
            return (
              <li key={item.id}>
                <button
                  onClick={() => selectItem(item.id)}
                  className={`w-full text-left px-4 py-3 border-b border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800 transition-colors ${
                    selectedId === item.id ? "bg-brand-light/50 dark:bg-brand/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1">
                    <ChannelBadge channel={item.channel} size={28} />
                    <span className="text-sm font-medium truncate flex-1">
                      {item.customer.firstName} {item.customer.lastName}
                    </span>
                    <span className={item.status === "NEW" ? "pill-warning shrink-0 !py-0.5" : "pill-neutral shrink-0 !py-0.5"}>
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-ink-950/60 dark:text-surface/60 truncate pl-9">{item.summary}</p>
                  <p className={`text-[10px] mt-0.5 pl-9 ${ageTone(ageMins(item.createdAt))}`}>
                    {channelLabel(item.channel)} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </p>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-sm text-ink-950/50 dark:text-surface/50 text-center">
              Queue is empty for this filter.
            </li>
          )}
        </ul>
      </div>

      {/* Thread pane */}
      <div className="overflow-y-auto p-6 flex flex-col">
        {!selected ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50">Select a message from the queue.</p>
        ) : (
          <ThreadView
            selected={selected}
            thread={thread}
            loading={loadingThread}
            onReplied={(msg) => {
              setThread((prev) => [...prev, msg]);
              setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, status: "IN_PROGRESS" } : i)));
            }}
          />
        )}
      </div>

      {/* Actions pane */}
      <div className="bg-surface-raised dark:bg-ink-900 border-l border-line-light dark:border-line-dark overflow-y-auto p-4 hidden lg:block">
        {selected && (
          <div className="card p-3.5 mb-4">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="avatar w-9 h-9 text-xs">{selected.customer.firstName[0]}{selected.customer.lastName[0]}</span>
              <div className="min-w-0">
                <Link href={`/customers/${selected.customer.id}`} className="text-sm font-semibold hover:text-brand truncate block">{selected.customer.firstName} {selected.customer.lastName}</Link>
                <span className="text-[11px] text-ink-950/50 dark:text-surface/50">{selected.customer.segment ?? "No segment"}</span>
              </div>
            </div>
            <dl className="text-xs space-y-1 text-ink-950/70 dark:text-surface/70">
              {selected.customer.phone && <div className="flex justify-between gap-2"><dt className="text-ink-950/40 dark:text-surface/40">Phone</dt><dd><a href={`tel:${selected.customer.phone}`} className="hover:text-brand">{selected.customer.phone}</a></dd></div>}
              {selected.customer.email && <div className="flex justify-between gap-2"><dt className="text-ink-950/40 dark:text-surface/40">Email</dt><dd className="truncate"><a href={`mailto:${selected.customer.email}`} className="hover:text-brand">{selected.customer.email}</a></dd></div>}
              {selected.contact && <div className="flex justify-between gap-2"><dt className="text-ink-950/40 dark:text-surface/40">Reached us from</dt><dd className="truncate">{selected.contact}</dd></div>}
            </dl>
            <div className="flex gap-2 mt-3">
              <Link href={`/cases/new?customerId=${selected.customer.id}`} className="btn-secondary !py-1 !px-2.5 text-xs flex-1">Log case</Link>
              <Link href={`/customers/${selected.customer.id}`} className="btn-secondary !py-1 !px-2.5 text-xs flex-1">Profile</Link>
            </div>
          </div>
        )}
        {selected && !selected.caseId && (
          <ConvertToCaseForm
            interactionId={selected.id}
            defaultSubject={selected.summary ?? ""}
            defaultComment={selected.summary ?? ""}
            onConverted={(caseId) => {
              setItems((prev) => prev.filter((i) => i.id !== selected.id));
              setSelectedId(null);
              router.refresh();
              router.push(`/cases/${caseId}`);
            }}
          />
        )}
        {selected?.caseId && (
          <div className="text-sm">
            <p className="text-ink-950/60 dark:text-surface/60 mb-2">Already linked to a case.</p>
            <Link href={`/cases/${selected.caseId}`} className="text-brand hover:underline text-sm">
              Open case →
            </Link>
          </div>
        )}
        {selected && (
          <button
            onClick={async () => {
              await fetch(`/api/inbox/${selected.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "CLOSED" }),
              });
              setItems((prev) => prev.filter((i) => i.id !== selected.id));
              setSelectedId(null);
              refreshQueue();
            }}
            className="btn-secondary mt-4 w-full text-xs"
          >
            Close without a case
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
        active ? "bg-brand text-white" : "bg-surface dark:bg-ink-800 text-ink-950/70 dark:text-surface/70 hover:bg-line-light dark:hover:bg-ink-700"
      }`}
    >
      {label}
    </button>
  );
}

function ThreadView({
  selected,
  thread,
  loading,
  onReplied,
}: {
  selected: Item;
  thread: ThreadMsg[];
  loading: boolean;
  onReplied: (msg: ThreadMsg) => void;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = SENDABLE.has(selected.channel);

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/inbox/${selected.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setSending(false);
    if (res.ok) {
      const { reply } = await res.json();
      onReplied(reply);
      setMessage("");
    } else {
      const d = await res.json().catch(() => ({ error: "Could not send" }));
      setError(d.error ?? "Could not send");
    }
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ChannelBadge channel={selected.channel} size={40} />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">
              {selected.customer.firstName} {selected.customer.lastName}
            </h2>
            <p className="text-sm text-ink-950/60 dark:text-surface/60 truncate">
              {channelLabel(selected.channel)} · {selected.contact ?? selected.customer.segment ?? "No segment"}
              {selected.subject ? ` · ${selected.subject}` : ""}
            </p>
          </div>
        </div>
        {selected.channel === "VOICE" && (selected.contact || selected.customer.phone) && (
          <a href={`tel:${selected.contact ?? selected.customer.phone}`} className="btn-primary text-xs !px-3 !py-1.5 shrink-0"><PhoneCall size={14} /> Call back</a>
        )}
      </div>

      <div className="flex-1 space-y-3 mb-4">
        {loading ? (
          <p className="text-sm text-ink-950/40 dark:text-surface/40">Loading thread…</p>
        ) : (
          thread.map((m) => (
            <div key={m.id} className={`max-w-[80%] ${m.direction === "outbound" ? "ml-auto" : ""}`}>
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.direction === "outbound"
                    ? "bg-brand text-white rounded-br-md"
                    : "bg-surface-raised dark:bg-ink-900 border border-line-light dark:border-line-dark rounded-bl-md"
                }`}
              >
                {m.summary}
              </div>
              <p
                className={`text-[10px] text-ink-950/40 dark:text-surface/40 mt-1 ${
                  m.direction === "outbound" ? "text-right" : ""
                }`}
              >
                {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
              </p>
            </div>
          ))
        )}
      </div>

      {error && (
        <p className="text-xs text-sla-breach flex items-start gap-1.5 mb-2"><AlertCircle size={14} className="shrink-0 mt-px" />{error}</p>
      )}
      {!canSend && (
        <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mb-1">Notes on {channelLabel(selected.channel).toLowerCase()} are saved to the history but not sent to the customer.</p>
      )}
      <div className="flex gap-2 sticky bottom-0 bg-surface dark:bg-ink-950 pt-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={canSend ? `Reply on ${channelLabel(selected.channel)}…` : "Add a note…"}
          rows={2}
          className="input flex-1 resize-none"
        />
        <button
          onClick={send}
          disabled={sending || !message.trim()}
          className="btn-primary px-3.5"
        >
          <Send size={16} />
        </button>
      </div>
    </>
  );
}

function ConvertToCaseForm({
  interactionId,
  defaultSubject,
  defaultComment,
  onConverted,
}: {
  interactionId: string;
  defaultSubject: string;
  defaultComment: string;
  onConverted: (caseId: string) => void;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [comment, setComment] = useState(defaultComment);
  const [type, setType] = useState("SERVICE_REQUEST");
  const [priority, setPriority] = useState("MEDIUM");
  const [status, setStatus] = useState("NEW");
  const [caseCodeId, setCaseCodeId] = useState("");
  const [isTransactional, setIsTransactional] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [unitId, setUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unitRequired = statusRequiresUnit(status);
  // Escalation unit is available for every case (transactional or not).
  const unitFieldVisible = true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!comment.trim()) return setError("A comment/description is required for every case.");
    if (isTransactional && (!amount || !currency)) {
      return setError("Amount and currency are required for a transactional case.");
    }
    if (unitRequired && !unitId) {
      return setError(`Status "${STATUS_LABEL[status]}" requires selecting a unit.`);
    }

    setSaving(true);
    const res = await fetch(`/api/inbox/${interactionId}/convert-to-case`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        type,
        priority,
        status,
        description: comment,
        caseCodeId: caseCodeId || undefined,
        isTransactional,
        transactionAmount: isTransactional ? Number(amount) : undefined,
        transactionCurrency: isTransactional ? currency : undefined,
        escalatedUnitId: unitFieldVisible && unitId ? unitId : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to convert" }));
      setError(msg);
      return;
    }
    const { case: created } = await res.json();
    onConverted(created.id);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 tracking-wide">Convert to case</h3>
      <div>
        <label className="block text-xs font-medium mb-1">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Interaction type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="input">
          <option value="COMPLAINT">Complaint</option>
          <option value="SERVICE_REQUEST">Request</option>
          <option value="INQUIRY">Enquiry</option>
          <option value="INCIDENT">Incident</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Priority</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            if (!statusRequiresUnit(e.target.value)) setUnitId("");
          }}
          className="input"
        >
          {CASE_STATUSES.filter((s) => s !== "CLOSED").map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <CaseCodeSelect type={type} value={caseCodeId} onChange={setCaseCodeId} />

      <TransactionalToggle
        isTransactional={isTransactional}
        onToggle={setIsTransactional}
        amount={amount}
        onAmountChange={setAmount}
        currency={currency}
        onCurrencyChange={setCurrency}
      />

      <div>
        <label className="block text-xs font-medium mb-1">
          Comment / description <span className="text-sla-breach">*</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="input resize-none"
        />
      </div>

      <UnitEscalationField visible={unitFieldVisible} required={unitRequired} unitId={unitId} onUnitChange={setUnitId} />

      {error && <p className="text-xs text-sla-breach">{error}</p>}
      <button type="submit" disabled={saving || !subject.trim()} className="btn-primary w-full text-sm">
        {saving ? "Creating…" : "Create case & link"}
      </button>
    </form>
  );
}

function SimulateForm({
  customers,
  onCreated,
}: {
  customers: { id: string; firstName: string; lastName: string }[];
  onCreated: (item: Item) => void;
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [channel, setChannel] = useState<string>("EMAIL");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId || !message.trim()) return setError("Pick a customer and enter a message.");
    const res = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, channel, summary: message }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
      setError(msg);
      return;
    }
    const { interaction } = await res.json();
    const customer = customers.find((c) => c.id === customerId)!;
    onCreated({
      id: interaction.id,
      channel: interaction.channel,
      status: interaction.status,
      summary: interaction.summary,
      createdAt: interaction.createdAt,
      caseId: null,
      customer: { ...customer, segment: null, sentimentAvg: null },
      agent: null,
    });
    setMessage("");
  }

  return (
    <form onSubmit={submit} className="p-4 border-b border-line-light dark:border-line-dark space-y-2 bg-surface dark:bg-ink-800">
      <p className="text-[11px] text-ink-950/50 dark:text-surface/50">
        Stand-in for a real channel webhook — wires the same ingest path a live provider would call.
      </p>
      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input text-xs !py-1.5">
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.firstName} {c.lastName}
          </option>
        ))}
      </select>
      <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input text-xs !py-1.5">
        {CHANNELS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message content…"
        rows={2}
        className="input text-xs resize-none"
      />
      {error && <p className="text-[11px] text-sla-breach">{error}</p>}
      <button type="submit" className="btn-primary w-full text-xs !py-1.5">
        Add to inbox
      </button>
    </form>
  );
}
