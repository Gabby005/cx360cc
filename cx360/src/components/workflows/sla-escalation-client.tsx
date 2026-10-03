"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, Bell, ChevronDown } from "lucide-react";
import { PRIORITIES, type NotificationSettings } from "@/lib/notification-settings";
import { TEMPLATE_BY_KEY } from "@/lib/notification-templates";
import { EmailListInput } from "@/components/notifications/email-list-input";
import { TemplateEditor, type TemplateState } from "@/components/notifications/template-editor";

type Props = {
  initial: NotificationSettings;
  templates: { level1: TemplateState; level2: TemplateState };
  bankName: string;
};

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-brand" : "bg-ink-950/20 dark:bg-surface/20"}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function EditContent({ templateKey, state, bankName }: { templateKey: "sla.level1.email" | "sla.level2.email"; state: TemplateState; bankName: string }) {
  const [open, setOpen] = useState(false);
  const def = TEMPLATE_BY_KEY.get(templateKey)!;
  return (
    <div className="border-t border-line-light dark:border-line-dark pt-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-sm font-medium text-brand">
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide email content" : "Edit email content"}
      </button>
      {open && (
        <div className="mt-4">
          <TemplateEditor def={def} initial={state} bankName={bankName} />
        </div>
      )}
    </div>
  );
}

export function SlaEscalationClient({ initial, templates, bankName }: Props) {
  const router = useRouter();
  const [s, setS] = useState(initial.sla);
  const [saved, setSaved] = useState(JSON.stringify(initial.sla));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = JSON.stringify(s) !== saved;
  const upd = (patch: Partial<typeof s>) => { setS((p) => ({ ...p, ...patch })); setMsg(null); };
  const l1 = (patch: Partial<typeof s.level1>) => upd({ level1: { ...s.level1, ...patch } });
  const l2 = (patch: Partial<typeof s.level2>) => upd({ level2: { ...s.level2, ...patch } });

  const problem =
    s.level1.enabled && s.level1.to.length === 0 ? "Add at least one email address for manager one, or switch Level 1 off." :
    s.level2.enabled && s.level2.to.length === 0 ? "Add at least one email address for manager two, or switch Level 2 off." :
    s.priorities.length === 0 ? "Pick at least one priority." : null;

  async function save() {
    setSaving(true);
    setMsg(null);
    const { enabledSince: _ignored, ...sla } = s;
    const res = await fetch("/api/admin/notification-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sla }) });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Couldn't save" });
      return;
    }
    setS(data.settings.sla);
    setSaved(JSON.stringify(data.settings.sla));
    setMsg({ ok: true, text: "Saved. The next SLA check uses these settings." });
    router.refresh();
  }

  const active = s.level1.enabled || s.level2.enabled;
  const sinceText = s.enabledSince ? new Date(s.enabledSince).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <section className="card p-5 space-y-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-9 h-9 rounded-lg bg-sla-breach/10 text-sla-breach grid place-items-center shrink-0"><Bell size={18} /></span>
        <div>
          <h2 className="text-base font-semibold">When the SLA is exceeded</h2>
          <p className="text-sm text-ink-950/60 dark:text-surface/60 mt-0.5">
            Two steps. Switch each on, say who gets the email, and edit the wording. Everything here is yours to change at any time.
          </p>
        </div>
      </div>

      {/* what counts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg bg-surface dark:bg-ink-800 p-4">
        <div>
          <label className="block text-xs font-medium mb-1">Escalate when a ticket misses its…</label>
          <select value={s.trigger} onChange={(e) => upd({ trigger: e.target.value as "resolution" | "any" })} className="input text-sm">
            <option value="resolution">Resolution deadline (turnaround time)</option>
            <option value="any">First-response or resolution deadline — whichever is missed first</option>
          </select>
        </div>
        <div>
          <div className="text-xs font-medium mb-1.5">For these priorities</div>
          <div className="flex flex-wrap gap-3">
            {PRIORITIES.map((p) => (
              <label key={p} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={s.priorities.includes(p)} onChange={(e) => upd({ priorities: e.target.checked ? [...s.priorities, p] : s.priorities.filter((x) => x !== p) })} />
                {PRIORITY_LABEL[p]}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Level 1 */}
      <div className={`rounded-xl border p-4 space-y-4 ${s.level1.enabled ? "border-brand/40" : "border-line-light dark:border-line-dark"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-brand text-white grid place-items-center text-xs font-semibold">1</span>
            <div>
              <div className="font-medium text-sm">Level 1 — manager one</div>
              <div className="text-xs text-ink-950/50 dark:text-surface/50">Emailed the first time a ticket exceeds its turnaround time.</div>
            </div>
          </div>
          <Toggle on={s.level1.enabled} onChange={(v) => l1({ enabled: v })} label="Level 1" />
        </div>
        {s.level1.enabled && (
          <>
            <EmailListInput label="Send to (manager one)" value={s.level1.to} onChange={(to) => l1({ to })} placeholder="manager.one@bank.com" hint="Press Enter after each address. Add as many as you like." />
            <EmailListInput label="Also copy (optional)" value={s.level1.cc} onChange={(cc) => l1({ cc })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.level1.ccOwner} onChange={(e) => l1({ ccOwner: e.target.checked })} />
              Copy the ticket owner
            </label>
            <EditContent templateKey="sla.level1.email" state={templates.level1} bankName={bankName} />
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-ink-950/50 dark:text-surface/50">
        <ArrowDown size={14} />
        if the ticket is still not closed after
        <input
          type="number"
          min={1}
          max={720}
          value={Number.isFinite(s.level2.afterHours) ? s.level2.afterHours : ""}
          onChange={(e) => l2({ afterHours: parseInt(e.target.value, 10) })}
          className="input !py-1 !px-2 text-sm w-20 text-center"
          aria-label="Hours before Level 2"
        />
        hours
        <ArrowDown size={14} />
      </div>

      {/* Level 2 */}
      <div className={`rounded-xl border p-4 space-y-4 ${s.level2.enabled ? "border-sla-breach/40" : "border-line-light dark:border-line-dark"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-sla-breach text-white grid place-items-center text-xs font-semibold">2</span>
            <div>
              <div className="font-medium text-sm">Level 2 — manager two</div>
              <div className="text-xs text-ink-950/50 dark:text-surface/50">Emailed if the ticket is still open {s.level2.afterHours} hours after the deadline was missed.</div>
            </div>
          </div>
          <Toggle on={s.level2.enabled} onChange={(v) => l2({ enabled: v })} label="Level 2" />
        </div>
        {s.level2.enabled && (
          <>
            <EmailListInput label="Send to (manager two)" value={s.level2.to} onChange={(to) => l2({ to })} placeholder="manager.two@bank.com" hint="Press Enter after each address." />
            <div>
              <div className="text-xs font-medium mb-1.5">Copy</div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.level2.ccOwner} onChange={(e) => l2({ ccOwner: e.target.checked })} /> The ticket owner</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.level2.ccLevel1} onChange={(e) => l2({ ccLevel1: e.target.checked })} /> Manager one{s.level1.to.length ? ` (${s.level1.to.length})` : ""}</label>
              </div>
            </div>
            <EmailListInput label="Another address to copy" value={s.level2.cc} onChange={(cc) => l2({ cc })} placeholder="add before go-live" hint="Extra people who should always see Level 2 escalations. You can change this any time." />
            <EditContent templateKey="sla.level2.email" state={templates.level2} bankName={bankName} />
          </>
        )}
      </div>

      {/* save */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={!dirty || saving || !!problem} className="btn-primary text-sm">
          {saving ? "Saving…" : "Save escalation settings"}
        </button>
        {problem && dirty && <span className="text-xs text-sla-warning">{problem}</span>}
        {msg && <span className={`text-sm ${msg.ok ? "text-sla-ok" : "text-sla-breach"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-ink-950/50 dark:text-surface/50">
        {active && sinceText
          ? `Active since ${sinceText}. Only tickets whose deadline passes after that moment are escalated, so switching this on never emails managers about tickets that were already overdue.`
          : "Off at the moment. Once you switch a level on, only tickets whose deadline passes after that moment are escalated — nothing is sent for tickets that are already overdue."}{" "}
        Emails go out through the Notification centre, and the SLA check runs on the schedule you set up for it.
      </p>
    </section>
  );
}
