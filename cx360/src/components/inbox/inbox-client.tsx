"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Phone, Mail, MessageSquare, Plus, Send } from "lucide-react";

const CHANNELS = ["VOICE", "EMAIL", "SMS", "WHATSAPP", "CHAT", "PORTAL", "SOCIAL"] as const;
const CHANNEL_ICON: Record<string, typeof Phone> = {
  VOICE: Phone,
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: MessageSquare,
  CHAT: MessageSquare,
  PORTAL: MessageSquare,
  SOCIAL: MessageSquare,
};

type Item = {
  id: string;
  channel: string;
  status: string;
  summary: string | null;
  createdAt: string;
  caseId: string | null;
  customer: { id: string; firstName: string; lastName: string; segment: string | null; sentimentAvg: number | null };
  agent: { id: string; name: string } | null;
};

type ThreadMsg = { id: string; direction: string; summary: string | null; createdAt: string; channel: string };

export function InboxClient({ initialItems, customers }: { initialItems: Item[]; customers: { id: string; firstName: string; lastName: string }[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [showSimulate, setShowSimulate] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  const filtered = useMemo(
    () => (channelFilter === "all" ? items : items.filter((i) => i.channel === channelFilter)),
    [items, channelFilter]
  );
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
    <div className="h-full grid grid-cols-1 lg:grid-cols-[260px_1fr_320px]">
      {/* Channel + queue pane */}
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
          <div className="flex flex-wrap gap-1.5">
            <FilterPill active={channelFilter === "all"} onClick={() => setChannelFilter("all")} label="All" />
            {CHANNELS.map((c) => (
              <FilterPill key={c} active={channelFilter === c} onClick={() => setChannelFilter(c)} label={c} />
            ))}
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
                    <span className="avatar w-7 h-7 text-[10px] shrink-0">
                      {item.customer.firstName[0]}
                      {item.customer.lastName[0]}
                    </span>
                    <span className="text-sm font-medium truncate flex-1">
                      {item.customer.firstName} {item.customer.lastName}
                    </span>
                    <span className={item.status === "NEW" ? "pill-warning shrink-0 !py-0.5" : "pill-neutral shrink-0 !py-0.5"}>
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-ink-950/60 dark:text-surface/60 truncate pl-9">{item.summary}</p>
                  <p className="text-[10px] text-ink-950/40 dark:text-surface/40 mt-0.5 pl-9">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
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
        {selected && !selected.caseId && (
          <ConvertToCaseForm
            interactionId={selected.id}
            defaultSubject={selected.summary ?? ""}
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

  async function send() {
    if (!message.trim()) return;
    setSending(true);
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
    }
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          {selected.customer.firstName} {selected.customer.lastName}
        </h2>
        <p className="text-sm text-ink-950/60 dark:text-surface/60">
          {selected.channel} · {selected.customer.segment ?? "No segment"}
        </p>
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
          placeholder="Reply on this channel…"
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
  onConverted,
}: {
  interactionId: string;
  defaultSubject: string;
  onConverted: (caseId: string) => void;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [type, setType] = useState("SERVICE_REQUEST");
  const [priority, setPriority] = useState("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [codes, setCodes] = useState<{ id: string; code: string; category: string; subcategory: string | null }[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [category, setCategory] = useState("");
  const [caseCodeId, setCaseCodeId] = useState("");

  // Reload the category/subcategory options whenever the interaction
  // type changes — the taxonomy is scoped per type (Complaint's codes
  // aren't the same list as Request's or Enquiry's).
  useEffect(() => {
    setCategory("");
    setCaseCodeId("");
    setLoadingCodes(true);
    fetch(`/api/case-codes?type=${type}`)
      .then((r) => r.json())
      .then((data) => setCodes(data.codes ?? []))
      .finally(() => setLoadingCodes(false));
  }, [type]);

  const categories = [...new Set(codes.map((c) => c.category))];
  const subcategoryOptions = codes.filter((c) => c.category === category);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/inbox/${interactionId}/convert-to-case`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, type, priority, caseCodeId: caseCodeId || undefined }),
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
        <label className="block text-xs font-medium mb-1">Category</label>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setCaseCodeId("");
          }}
          disabled={loadingCodes}
          className="input"
        >
          <option value="">
            {loadingCodes ? "Loading…" : categories.length === 0 ? "No codes set up for this type" : "Select category"}
          </option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {category && (
        <div>
          <label className="block text-xs font-medium mb-1">Subcategory</label>
          <select value={caseCodeId} onChange={(e) => setCaseCodeId(e.target.value)} className="input">
            <option value="">Select subcategory</option>
            {subcategoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subcategory ?? c.code} ({c.code})
              </option>
            ))}
          </select>
        </div>
      )}

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
