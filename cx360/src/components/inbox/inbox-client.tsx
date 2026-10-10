"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Plus, Send, PhoneCall, Search, AlertCircle, Flag, Mail, MailOpen, UserCheck, XCircle, RotateCcw, Users, Check, X as XIcon, Inbox as InboxIcon, Settings2, Trash2 } from "lucide-react";
import { ChannelBadge } from "@/components/channels/channel-icon";
import { CHANNEL_ORDER, CHANNEL_COLOR, channelLabel } from "@/lib/channel-ui";
import { FLAGS, FLAG_INFO, flagRank, tagFor, TAG_PALETTE, MAX_TAGS, type TeamTag } from "@/lib/inbox-ui";
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
  flag?: string | null;
  colorTag?: string | null;
  readAt?: string | null;
  customer: { id: string; firstName: string; lastName: string; segment: string | null; sentimentAvg: number | null; email?: string | null; phone?: string | null };
  agent: { id: string; name: string } | null;
};

type ThreadMsg = { id: string; direction: string; summary: string | null; createdAt: string; channel: string };

type View = "open" | "unread" | "read" | "flagged" | "mine" | "closed" | "all";
const VIEWS: { key: View; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
  { key: "flagged", label: "Flagged" },
  { key: "mine", label: "Mine" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];
type Sort = "newest" | "oldest" | "priority" | "waiting";

const isOpen = (i: Item) => i.status === "NEW" || i.status === "IN_PROGRESS";

export function InboxClient({
  initialItems,
  customers,
  currentUserId,
  canEdit = true,
  canManageTeams = false,
  initialTags,
  initialChannel = "all",
}: {
  initialItems: Item[];
  customers: { id: string; firstName: string; lastName: string }[];
  currentUserId: string;
  canEdit?: boolean;
  canManageTeams?: boolean;
  initialTags: TeamTag[];
  initialChannel?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<View>("open");
  const [channelFilter, setChannelFilter] = useState<string>(initialChannel);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [showSimulate, setShowSimulate] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tags, setTags] = useState<TeamTag[]>(initialTags);
  const [showManage, setShowManage] = useState(false);

  const viewTest = (i: Item): boolean => {
    switch (view) {
      case "open": return isOpen(i);
      case "unread": return !i.readAt;
      case "read": return !!i.readAt;
      case "flagged": return !!i.flag;
      case "mine": return i.agent?.id === currentUserId;
      case "closed": return i.status === "CLOSED";
      default: return true;
    }
  };

  // Search + colour narrow everything; the view tabs and channel tiles then split it up.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (teamFilter === "all" || (teamFilter === "none" ? !i.colorTag : i.colorTag === teamFilter)) &&
        (!q || `${i.customer.firstName} ${i.customer.lastName} ${i.summary ?? ""} ${i.contact ?? ""} ${i.subject ?? ""}`.toLowerCase().includes(q))
    );
  }, [items, query, teamFilter]);

  const viewCounts = useMemo(() => {
    const c: Record<View, number> = { open: 0, unread: 0, read: 0, flagged: 0, mine: 0, closed: 0, all: searched.length };
    for (const i of searched) {
      if (isOpen(i)) c.open++;
      if (!i.readAt) c.unread++; else c.read++;
      if (i.flag) c.flagged++;
      if (i.agent?.id === currentUserId) c.mine++;
      if (i.status === "CLOSED") c.closed++;
    }
    return c;
  }, [searched, currentUserId]);

  const inView = useMemo(() => searched.filter(viewTest), [searched, view, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const list = inView.filter((i) => channelFilter === "all" || i.channel === channelFilter);
    const byDate = (a: Item, b: Item) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === "oldest" || sort === "waiting") return [...list].sort((a, b) => -byDate(a, b));
    if (sort === "priority") return [...list].sort((a, b) => flagRank(b.flag) - flagRank(a.flag) || (a.readAt ? 1 : 0) - (b.readAt ? 1 : 0) || byDate(a, b));
    return [...list].sort(byDate);
  }, [inView, channelFilter, sort]);

  const perChannel = useMemo(() => {
    const m = new Map<string, { n: number; unread: number; oldest: number }>();
    for (const i of inView) {
      const e = m.get(i.channel) ?? { n: 0, unread: 0, oldest: 0 };
      e.n++;
      if (!i.readAt) e.unread++;
      e.oldest = Math.max(e.oldest, ageMins(i.createdAt));
      m.set(i.channel, e);
    }
    return m;
  }, [inView]);
  const showOldest = view === "open" || view === "unread";
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const unreadTotal = viewCounts.unread;

  // ---- talking to the server (optimistic: the screen changes first, the save follows) ----
  function patchLocal(ids: string[], patch: Partial<Item>) {
    const set = new Set(ids);
    setItems((prev) => prev.map((i) => (set.has(i.id) ? { ...i, ...patch } : i)));
  }
  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3500);
  }
  async function patchOne(id: string, body: Record<string, unknown>, local: Partial<Item>) {
    patchLocal([id], local);
    const res = await fetch(`/api/inbox/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      flash("That change could not be saved. Please try again.");
      refresh();
    }
  }
  async function bulk(action: string, value?: string | null, ids: string[] = [...checked]) {
    if (ids.length === 0) return;
    const nowIso = new Date().toISOString();
    if (action === "read") patchLocal(ids, { readAt: nowIso });
    if (action === "unread") setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, readAt: null, status: i.status === "CLOSED" ? "NEW" : i.status } : i)));
    if (action === "flag") patchLocal(ids, { flag: value ?? null });
    if (action === "color") patchLocal(ids, { colorTag: value ?? null });
    if (action === "assign") patchLocal(ids, { agent: { id: currentUserId, name: "You" } });
    if (action === "close") setItems((prev) => prev.map((i) => (ids.includes(i.id) && isOpen(i) && !i.caseId ? { ...i, status: "CLOSED", readAt: i.readAt ?? nowIso } : i)));
    const res = await fetch("/api/inbox/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action, value }) });
    if (!res.ok) {
      flash("That change could not be saved. Please try again.");
      refresh();
    } else if (ids.length > 1) {
      flash(`Done for ${ids.length} messages.`);
    }
    setChecked(new Set());
  }
  async function refresh() {
    try {
      const res = await fetch("/api/inbox?feed=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.interactions);
    } catch {
      /* offline: keep what is on screen */
    }
  }

  // New messages appear by themselves.
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, 45_000);
    return () => clearInterval(t);
  }, []);

  async function selectItem(id: string) {
    setSelectedId(id);
    setLoadingThread(true);
    const it = items.find((i) => i.id === id);
    if (it && !it.readAt && canEdit) patchOne(id, { read: true }, { readAt: new Date().toISOString() });
    const res = await fetch(`/api/inbox/${id}`);
    const data = await res.json().catch(() => ({}));
    setThread(data.thread ?? []);
    setLoadingThread(false);
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  const allChecked = filtered.length > 0 && filtered.every((i) => checked.has(i.id));

  // Keyboard: j / k = next / previous, u = mark unread, f = cycle flag.
  const stateRef = useRef({ filtered, selectedId, selected, canEdit });
  stateRef.current = { filtered, selectedId, selected, canEdit };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (!t || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;
      const { filtered: list, selectedId: sid, selected: sel, canEdit: ok } = stateRef.current;
      if (e.key === "j" || e.key === "k") {
        const idx = list.findIndex((i) => i.id === sid);
        const next = list[e.key === "j" ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1)];
        if (next) selectItem(next.id);
      } else if (e.key === "u" && sel && ok) {
        patchOne(sel.id, { read: sel.readAt ? false : true }, sel.readAt ? { readAt: null, status: sel.status === "CLOSED" ? "NEW" : sel.status } : { readAt: new Date().toISOString() });
      } else if (e.key === "f" && sel && ok) {
        const order = [null, "URGENT", "HIGH", "LOW"] as const;
        const next = order[(order.indexOf((sel.flag as any) ?? null) + 1) % order.length];
        patchOne(sel.id, { flag: next }, { flag: next });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col">
      {/* Channel tiles — click to filter the queue */}
      <div className="px-4 py-2 border-b border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setChannelFilter("all")}
          className={`rounded-lg border px-3 py-1.5 text-left transition shrink-0 min-w-[96px] ${channelFilter === "all" ? "border-brand bg-brand-light/50 dark:bg-brand/10" : "border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800"}`}
        >
          <div className="text-[11px] text-ink-950/50 dark:text-surface/50">All channels</div>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-semibold font-mono leading-tight">{inView.length}</span>
            {unreadTotal > 0 && view !== "unread" && <span className="text-[10px] font-medium text-brand">{unreadTotal} unread</span>}
          </div>
        </button>
        {CHANNELS.filter((c) => c !== "SOCIAL" || perChannel.has(c)).map((c) => {
          const e = perChannel.get(c);
          const active = channelFilter === c;
          return (
            <button
              key={c}
              onClick={() => setChannelFilter(active ? "all" : c)}
              style={active ? { borderColor: CHANNEL_COLOR[c] } : undefined}
              className={`rounded-lg border px-3 py-1.5 text-left transition shrink-0 min-w-[104px] ${active ? "bg-brand-light/50 dark:bg-brand/10" : "border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800"} ${e ? "" : "opacity-60"}`}
            >
              <div className="flex items-center gap-1.5">
                <ChannelBadge channel={c} size={20} />
                <span className="text-[11px] text-ink-950/60 dark:text-surface/60 truncate">{channelLabel(c)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-base font-semibold font-mono leading-tight">{e?.n ?? 0}</span>
                {e && showOldest ? <span className={`text-[10px] font-mono ${ageTone(e.oldest)}`}>oldest {fmtAge(e.oldest)}</span> : e && e.unread > 0 ? <span className="text-[10px] font-medium text-brand">{e.unread} unread</span> : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[400px_1fr_340px] 2xl:grid-cols-[460px_1fr_400px]">
        {/* Queue pane */}
        <div className="bg-surface-raised dark:bg-ink-900 border-r border-line-light dark:border-line-dark flex flex-col min-h-0">
          <div className="px-3 pt-3 pb-2 border-b border-line-light dark:border-line-dark space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold shrink-0">Inbox</h1>
              {unreadTotal > 0 && <span className="pill-warning !py-0.5 shrink-0">{unreadTotal} unread</span>}
              <div className="relative flex-1 min-w-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-950/40 dark:text-surface/40" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="input !pl-8 !py-1 text-xs" />
              </div>
              {canEdit && (
                <button
                  onClick={() => setShowSimulate((v) => !v)}
                  title="Simulate an incoming message (stand-in for a real channel webhook)"
                  className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-ink-950/50 dark:text-surface/50 hover:bg-ink-950/5 dark:hover:bg-surface/10 hover:text-brand"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            {/* View tabs: one row, scrolls sideways if needed */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors shrink-0 ${view === v.key ? "bg-brand text-white" : "bg-surface dark:bg-ink-800 text-ink-950/70 dark:text-surface/70 hover:bg-line-light dark:hover:bg-ink-700"}`}
                >
                  {v.label} <span className="font-mono opacity-80">{viewCounts[v.key]}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {canEdit && (
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  onChange={() => setChecked(allChecked ? new Set() : new Set(filtered.map((i) => i.id)))}
                  className="accent-brand ml-1"
                />
              )}
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="input !py-1 text-xs flex-1 min-w-0" title="Show one team's messages">
                <option value="all">All teams</option>
                {tags.map((t) => (
                  <option key={t.key} value={t.key}>{t.name}</option>
                ))}
                <option value="none">No team</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="input !py-1 text-xs flex-1 min-w-0" title="Sort">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="priority">Priority first</option>
              </select>
            </div>

            {canEdit && checked.size > 0 && (
              <div className="flex items-center gap-1 flex-wrap rounded-md bg-brand-light/50 dark:bg-brand/10 px-2 py-1.5">
                <span className="text-[11px] font-medium mr-1">{checked.size} selected</span>
                <MiniBtn onClick={() => bulk("read")} title="Mark read"><MailOpen size={13} /></MiniBtn>
                <MiniBtn onClick={() => bulk("unread")} title="Mark unread"><Mail size={13} /></MiniBtn>
                <FlagMenu small value={null} onPick={(f) => bulk("flag", f)} />
                <TeamMenu small tags={tags} value={null} onPick={(c) => bulk("color", c)} canManage={canManageTeams} onManage={() => setShowManage(true)} />
                <MiniBtn onClick={() => bulk("assign")} title="Assign to me"><UserCheck size={13} /></MiniBtn>
                <MiniBtn onClick={() => bulk("close")} title="Close without a case"><XCircle size={13} /></MiniBtn>
                <MiniBtn onClick={() => setChecked(new Set())} title="Clear selection"><XIcon size={13} /></MiniBtn>
              </div>
            )}
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

          <ul className="flex-1 overflow-y-auto">
            {filtered.map((item) => {
              const unread = !item.readAt;
              const team = tagFor(tags, item.colorTag);
              const flag = item.flag && FLAG_INFO[item.flag as keyof typeof FLAG_INFO];
              const closed = item.status === "CLOSED";
              return (
                <li key={item.id} className="group relative">
                  <button
                    onClick={() => selectItem(item.id)}
                    style={{ borderLeft: `4px solid ${team?.color ?? "transparent"}` }}
                    className={`w-full text-left pl-3 pr-4 py-3 border-b border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800 transition-colors ${
                      selectedId === item.id ? "bg-brand-light/50 dark:bg-brand/10" : ""
                    } ${closed ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      {canEdit && <span className="w-4 shrink-0" />}
                      <span className={`w-2 h-2 rounded-full shrink-0 ${unread ? "bg-brand" : "bg-transparent"}`} aria-label={unread ? "Unread" : "Read"} />
                      <ChannelBadge channel={item.channel} size={28} />
                      <span className={`text-sm truncate flex-1 ${unread ? "font-semibold" : "font-medium text-ink-950/80 dark:text-surface/80"}`}>
                        {item.customer.firstName} {item.customer.lastName}
                      </span>
                      {flag && <Flag size={14} style={{ color: flag.color }} fill="currentColor" aria-label={`${flag.label} priority`} />}
                      <span className={`text-[10px] text-ink-950/40 dark:text-surface/40 shrink-0 ${canEdit ? "group-hover:invisible group-focus-within:invisible" : ""}`}>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                    </div>
                    <p className={`text-xs line-clamp-2 pl-[3.75rem] ${unread ? "text-ink-950/80 dark:text-surface/80" : "text-ink-950/55 dark:text-surface/55"}`}>{item.summary}</p>
                    <p className={`text-[10px] mt-1 pl-[3.75rem] flex items-center gap-1.5 flex-wrap ${ageTone(ageMins(item.createdAt))}`}>
                      <span>{channelLabel(item.channel)}</span>
                      {team && (
                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 text-white" style={{ backgroundColor: team.color }}>{team.name}</span>
                      )}
                      {item.agent && <span className="text-ink-950/50 dark:text-surface/50">· {item.agent.id === currentUserId ? "You" : item.agent.name}</span>}
                      {closed && <span className="pill-neutral !py-0 !text-[10px]">Closed</span>}
                      {item.status === "LINKED" && <span className="pill-neutral !py-0 !text-[10px]">Case</span>}
                      {item.status === "IN_PROGRESS" && <span className="pill-neutral !py-0 !text-[10px]">In progress</span>}
                    </p>
                  </button>
                  {canEdit && (
                    <>
                      <input
                        type="checkbox"
                        aria-label="Select message"
                        checked={checked.has(item.id)}
                        onChange={() => toggleCheck(item.id)}
                        className={`absolute left-[1.15rem] top-[1.05rem] accent-brand ${checked.size > 0 ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                      />
                      {/* Quick actions: tag a team, flag, or flip read/unread without opening the message (the message stays unread). */}
                      <div className="absolute right-2 top-2 hidden group-hover:flex group-focus-within:flex items-center gap-1 rounded-md bg-surface-raised dark:bg-ink-900 border border-line-light dark:border-line-dark shadow-sm px-1 py-0.5">
                        <TeamMenu small tags={tags} value={item.colorTag ?? null} onPick={(c) => patchOne(item.id, { colorTag: c }, { colorTag: c })} canManage={canManageTeams} onManage={() => setShowManage(true)} />
                        <FlagMenu small value={item.flag ?? null} onPick={(f) => patchOne(item.id, { flag: f }, { flag: f })} />
                        <MiniBtn
                          onClick={() =>
                            item.readAt
                              ? patchOne(item.id, { read: false }, { readAt: null, status: item.status === "CLOSED" ? "NEW" : item.status })
                              : patchOne(item.id, { read: true }, { readAt: new Date().toISOString() })
                          }
                          title={item.readAt ? "Mark unread" : "Mark read"}
                        >
                          {item.readAt ? <Mail size={13} /> : <MailOpen size={13} />}
                        </MiniBtn>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-10 text-sm text-ink-950/50 dark:text-surface/50 text-center">
                Nothing here for this filter.
              </li>
            )}
          </ul>
        </div>

        {/* Thread pane */}
        <div className="overflow-y-auto p-6 flex flex-col">
          {!selected ? (
            <Overview viewCounts={viewCounts} items={items} />
          ) : (
            <ThreadView
              selected={selected}
              thread={thread}
              loading={loadingThread}
              toolbar={
                canEdit ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <FlagMenu value={selected.flag ?? null} onPick={(f) => patchOne(selected.id, { flag: f }, { flag: f })} />
                    <TeamMenu tags={tags} value={selected.colorTag ?? null} onPick={(c) => patchOne(selected.id, { colorTag: c }, { colorTag: c })} canManage={canManageTeams} onManage={() => setShowManage(true)} />
                    <button
                      onClick={() =>
                        selected.readAt
                          ? patchOne(selected.id, { read: false }, { readAt: null, status: selected.status === "CLOSED" ? "NEW" : selected.status })
                          : patchOne(selected.id, { read: true }, { readAt: new Date().toISOString() })
                      }
                      className="btn-secondary !py-1 !px-2.5 text-xs"
                      title="Shortcut: u"
                    >
                      {selected.readAt ? <><Mail size={13} /> Mark unread</> : <><MailOpen size={13} /> Mark read</>}
                    </button>
                    {selected.agent?.id !== currentUserId && (
                      <button onClick={() => patchOne(selected.id, { assignToMe: true }, { agent: { id: currentUserId, name: "You" } })} className="btn-secondary !py-1 !px-2.5 text-xs">
                        <UserCheck size={13} /> Assign to me
                      </button>
                    )}
                    {isOpen(selected) && !selected.caseId && (
                      <button onClick={() => patchOne(selected.id, { status: "CLOSED" }, { status: "CLOSED", readAt: selected.readAt ?? new Date().toISOString() })} className="btn-secondary !py-1 !px-2.5 text-xs">
                        <XCircle size={13} /> Close without a case
                      </button>
                    )}
                  </div>
                ) : null
              }
              banner={
                selected.status === "CLOSED" ? (
                  <div className="mb-4 rounded-lg border border-line-light dark:border-line-dark bg-surface dark:bg-ink-800 px-3.5 py-2.5 text-sm flex items-center justify-between gap-3">
                    <span className="text-ink-950/70 dark:text-surface/70">Closed without a case. It stays here so you can find it again.</span>
                    {canEdit && (
                      <button onClick={() => patchOne(selected.id, { read: false }, { readAt: null, status: "NEW" })} className="btn-secondary !py-1 !px-2.5 text-xs shrink-0">
                        <RotateCcw size={13} /> Reopen as unread
                      </button>
                    )}
                  </div>
                ) : null
              }
              onReplied={(msg) => {
                setThread((prev) => [...prev, msg]);
                setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, status: i.status === "NEW" ? "IN_PROGRESS" : i.status, readAt: i.readAt ?? new Date().toISOString() } : i)));
              }}
            />
          )}
        </div>

        {/* Actions pane */}
        <div className="bg-surface-raised dark:bg-ink-900 border-l border-line-light dark:border-line-dark overflow-y-auto p-4 hidden lg:block">
          {selected && (
            <div className="card p-3.5 mb-4">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="avatar w-10 h-10 text-xs">{selected.customer.firstName[0]}{selected.customer.lastName[0]}</span>
                <div className="min-w-0">
                  <Link href={`/customers/${selected.customer.id}`} className="text-sm font-semibold hover:text-brand truncate block">{selected.customer.firstName} {selected.customer.lastName}</Link>
                  <span className="text-[11px] text-ink-950/50 dark:text-surface/50">{selected.customer.segment ?? "No segment"}</span>
                </div>
              </div>
              <dl className="text-xs space-y-1 text-ink-950/70 dark:text-surface/70">
                {selected.customer.phone && <div className="flex justify-between gap-2"><dt className="text-ink-950/40 dark:text-surface/40">Phone</dt><dd><a href={`tel:${selected.customer.phone}`} className="hover:text-brand">{selected.customer.phone}</a></dd></div>}
                {selected.customer.email && <div className="flex justify-between gap-2"><dt className="text-ink-950/40 dark:text-surface/40">Email</dt><dd className="truncate"><a href={`mailto:${selected.customer.email}`} className="hover:text-brand">{selected.customer.email}</a></dd></div>}
                {selected.contact && <div className="flex justify-between gap-2"><dt className="text-ink-950/40 dark:text-surface/40">Reached us from</dt><dd className="truncate">{selected.contact}</dd></div>}
                <div className="flex justify-between gap-2"><dt className="text-ink-950/40 dark:text-surface/40">Handled by</dt><dd>{selected.agent ? (selected.agent.id === currentUserId ? "You" : selected.agent.name) : "Nobody yet"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-ink-950/40 dark:text-surface/40">Arrived</dt><dd>{formatDistanceToNow(new Date(selected.createdAt), { addSuffix: true })}</dd></div>
              </dl>
              <div className="flex gap-2 mt-3">
                <Link href={`/cases/new?customerId=${selected.customer.id}`} className="btn-secondary !py-1 !px-2.5 text-xs flex-1">Log case</Link>
                <Link href={`/customers/${selected.customer.id}`} className="btn-secondary !py-1 !px-2.5 text-xs flex-1">Profile</Link>
              </div>
            </div>
          )}
          {selected && !selected.caseId && canEdit && (
            <ConvertToCaseForm
              key={selected.id}
              interactionId={selected.id}
              defaultSubject={selected.summary ?? ""}
              defaultComment={selected.summary ?? ""}
              onConverted={(caseId) => {
                patchLocal([selected.id], { status: "LINKED", caseId, readAt: selected.readAt ?? new Date().toISOString() });
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
        </div>
      </div>

      {showManage && (
        <ManageTeams
          tags={tags}
          onClose={() => setShowManage(false)}
          onSaved={(t) => {
            setTags(t);
            setShowManage(false);
            flash("Team codes saved.");
          }}
        />
      )}
      {notice && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink-950 text-white text-xs px-4 py-2 shadow-lg">{notice}</div>}
    </div>
  );
}

/** Shown when no message is selected: a quick picture of the queue and the shortcuts. */
function Overview({ viewCounts, items }: { viewCounts: Record<View, number>; items: Item[] }) {
  const urgent = items.filter((i) => i.flag === "URGENT" && isOpen(i)).length;
  const oldest = items.filter(isOpen).reduce((m, i) => Math.max(m, ageMins(i.createdAt)), 0);
  const stat = (label: string, value: string | number, tone = "") => (
    <div className="card p-4">
      <div className="text-[11px] text-ink-950/50 dark:text-surface/50">{label}</div>
      <div className={`text-2xl font-semibold font-mono ${tone}`}>{value}</div>
    </div>
  );
  return (
    <div className="m-auto w-full max-w-xl text-center">
      <InboxIcon size={34} className="mx-auto mb-3 text-ink-950/30 dark:text-surface/30" />
      <h2 className="text-lg font-semibold mb-1">Pick a message to start</h2>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-5">Opening a message marks it read. You can mark it unread again any time.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left mb-6">
        {stat("Open", viewCounts.open)}
        {stat("Unread", viewCounts.unread, viewCounts.unread ? "text-brand" : "")}
        {stat("Urgent", urgent, urgent ? "text-sla-breach" : "")}
        {stat("Oldest waiting", oldest ? fmtAge(oldest) : "–", ageTone(oldest))}
      </div>
      <p className="text-[11px] text-ink-950/45 dark:text-surface/45">
        Shortcuts: <kbd className="kbd">j</kbd> next · <kbd className="kbd">k</kbd> previous · <kbd className="kbd">u</kbd> read / unread · <kbd className="kbd">f</kbd> change flag
      </p>
    </div>
  );
}

function MiniBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className="w-7 h-7 rounded-md grid place-items-center bg-surface dark:bg-ink-800 border border-line-light dark:border-line-dark hover:text-brand">
      {children}
    </button>
  );
}

/** A small pop-up list. It floats above everything, so a scrolling list never clips it. Clicking anywhere else closes it. */
function Popover({ button, children }: { button: (open: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  function toggle() {
    if (pos) return setPos(null);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 220));
    setPos(r.bottom + 260 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 });
  }
  return (
    <span ref={ref} className="inline-block">
      {button(toggle)}
      {pos && (
        <>
          <span className="fixed inset-0 z-[60]" onClick={() => setPos(null)} />
          <span style={{ left: pos.left, top: pos.top, bottom: pos.bottom }} className="fixed z-[70] min-w-[170px] max-h-[320px] overflow-y-auto rounded-lg border border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 shadow-lg p-1.5 flex flex-col">
            {children(() => setPos(null))}
          </span>
        </>
      )}
    </span>
  );
}

function FlagMenu({ value, onPick, small }: { value: string | null; onPick: (f: string | null) => void; small?: boolean }) {
  const cur = value && FLAG_INFO[value as keyof typeof FLAG_INFO];
  return (
    <Popover
      button={(toggle) =>
        small ? (
          <MiniBtn onClick={toggle} title="Set priority flag"><Flag size={13} /></MiniBtn>
        ) : (
          <button onClick={toggle} className="btn-secondary !py-1 !px-2.5 text-xs" title="Shortcut: f">
            <Flag size={13} style={cur ? { color: cur.color } : undefined} fill={cur ? "currentColor" : "none"} /> {cur ? cur.label : "Flag"}
          </button>
        )
      }
    >
      {(close) => (
        <>
          {FLAGS.map((f) => (
            <button key={f} onClick={() => { onPick(f); close(); }} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface dark:hover:bg-ink-800 text-left">
              <Flag size={13} style={{ color: FLAG_INFO[f].color }} fill="currentColor" /> {FLAG_INFO[f].label}
              {value === f && <Check size={12} className="ml-auto" />}
            </button>
          ))}
          <button onClick={() => { onPick(null); close(); }} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface dark:hover:bg-ink-800 text-left text-ink-950/60 dark:text-surface/60">
            <XIcon size={13} /> No flag
          </button>
        </>
      )}
    </Popover>
  );
}

function TeamMenu({ tags, value, onPick, small, canManage, onManage }: { tags: TeamTag[]; value: string | null; onPick: (c: string | null) => void; small?: boolean; canManage?: boolean; onManage?: () => void }) {
  const cur = tagFor(tags, value);
  return (
    <Popover
      button={(toggle) =>
        small ? (
          <button
            onClick={toggle}
            title={cur ? `Team: ${cur.name}` : "Tag a team"}
            aria-label="Tag a team"
            className="w-7 h-7 rounded-md grid place-items-center bg-surface dark:bg-ink-800 border border-line-light dark:border-line-dark hover:text-brand"
          >
            {cur ? <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: cur.color }} /> : <Users size={13} />}
          </button>
        ) : (
          <button onClick={toggle} className="btn-secondary !py-1 !px-2.5 text-xs">
            {cur ? <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cur.color }} /> : <Users size={13} />} {cur ? cur.name : "Team"}
          </button>
        )
      }
    >
      {(close) => (
        <>
          {tags.map((t) => (
            <button key={t.key} onClick={() => { onPick(t.key); close(); }} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface dark:hover:bg-ink-800 text-left">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} /> <span className="truncate">{t.name}</span>
              {value === t.key && <Check size={12} className="ml-auto shrink-0" />}
            </button>
          ))}
          <button onClick={() => { onPick(null); close(); }} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface dark:hover:bg-ink-800 text-left text-ink-950/60 dark:text-surface/60">
            <XIcon size={13} /> No team
          </button>
          {canManage && onManage && (
            <button onClick={() => { close(); onManage(); }} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface dark:hover:bg-ink-800 text-left text-brand border-t border-line-light dark:border-line-dark mt-1 pt-2">
              <Settings2 size={13} /> Manage teams
            </button>
          )}
        </>
      )}
    </Popover>
  );
}

/** Supervisors add, rename, recolour or remove team codes. */
function ManageTeams({ tags, onClose, onSaved }: { tags: TeamTag[]; onClose: () => void; onSaved: (t: TeamTag[]) => void }) {
  const [rows, setRows] = useState<{ key?: string; name: string; color: string }[]>(tags.map((t) => ({ ...t })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/inbox/tags", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: rows }) });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not save");
    onSaved(data.tags);
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">Team codes</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 grid place-items-center rounded-full hover:bg-ink-950/5 dark:hover:bg-surface/10"><XIcon size={16} /></button>
        </div>
        <p className="text-xs text-ink-950/60 dark:text-surface/60 mb-4">Each team gets a colour. Agents tag messages with a team so everyone can see who should pick it up. Removing a team does not delete any message.</p>
        <ul className="space-y-2">
          {rows.map((r, idx) => (
            <li key={r.key ?? `new${idx}`} className="flex items-center gap-2">
              <Popover button={(toggle) => <button onClick={toggle} aria-label="Colour" className="w-8 h-8 rounded-md border border-line-light dark:border-line-dark shrink-0" style={{ backgroundColor: r.color }} />}>
                {(close) => (
                  <span className="grid grid-cols-6 gap-1.5 p-1">
                    {TAG_PALETTE.map((c) => (
                      <button key={c} aria-label={c} onClick={() => { setRows((p) => p.map((x, i) => (i === idx ? { ...x, color: c } : x))); close(); }} style={{ backgroundColor: c }} className={`w-6 h-6 rounded-full grid place-items-center text-white ${r.color === c ? "ring-2 ring-offset-1 ring-ink-950/50" : ""}`}>
                        {r.color === c && <Check size={12} />}
                      </button>
                    ))}
                  </span>
                )}
              </Popover>
              <input value={r.name} maxLength={24} onChange={(e) => setRows((p) => p.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} placeholder="Team name" className="input flex-1" />
              <button onClick={() => setRows((p) => p.filter((_, i) => i !== idx))} disabled={rows.length <= 1} aria-label="Remove team" className="w-8 h-8 grid place-items-center rounded-md text-ink-950/50 dark:text-surface/50 hover:text-sla-breach disabled:opacity-30"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
        {rows.length < MAX_TAGS && (
          <button
            onClick={() => setRows((p) => [...p, { name: `Team ${String.fromCharCode(65 + (p.length % 26))}`, color: TAG_PALETTE[p.length % TAG_PALETTE.length] }])}
            className="btn-secondary text-xs mt-3"
          >
            <Plus size={13} /> Add a team
          </button>
        )}
        {error && <p className="text-xs text-sla-breach mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-xs">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function ThreadView({
  selected,
  thread,
  loading,
  toolbar,
  banner,
  onReplied,
}: {
  selected: Item;
  thread: ThreadMsg[];
  loading: boolean;
  toolbar?: React.ReactNode;
  banner?: React.ReactNode;
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
      <div className="mb-3 flex items-start justify-between gap-3">
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

      {toolbar && <div className="mb-4 pb-3 border-b border-line-light dark:border-line-dark">{toolbar}</div>}
      {banner}
      <div className="flex-1 space-y-3 mb-4">
        {loading ? (
          <p className="text-sm text-ink-950/40 dark:text-surface/40">Loading thread…</p>
        ) : (
          thread.map((m) => (
            <div key={m.id} className={`max-w-[85%] ${m.direction === "outbound" ? "ml-auto" : ""}`}>
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
      flag: null,
      colorTag: null,
      readAt: null,
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
