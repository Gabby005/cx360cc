"use client";
import { useState } from "react";
import { AUTO_CHANNELS, AUTO_LABEL, autoReplyText, withSignature, type MessagingSettings } from "@/lib/messaging";

export function MessagingClient({ initial, agentName }: { initial: MessagingSettings; agentName: string }) {
  const [s, setS] = useState<MessagingSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    const res = await fetch("/api/admin/messaging", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: d.error ?? "Could not save" });
  }

  return (
    <div className="space-y-8">
      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Email signature</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.signature.enabled} onChange={(e) => setS({ ...s, signature: { ...s.signature, enabled: e.target.checked } })} /> Add the signature to every email an agent sends</label>
        <label className="block text-xs">Bank name
          <input className="input mt-1 w-full" value={s.signature.bankName} onChange={(e) => setS({ ...s, signature: { ...s.signature, bankName: e.target.value } })} />
        </label>
        <label className="block text-xs">Survey link (SurveyMonkey)
          <input className="input mt-1 w-full" placeholder="https://www.surveymonkey.com/r/…" value={s.signature.surveyUrl} onChange={(e) => setS({ ...s, signature: { ...s.signature, surveyUrl: e.target.value } })} />
        </label>
        <div>
          <div className="text-xs text-ink-950/50 dark:text-surface/50 mb-1">Preview</div>
          <pre className="text-xs whitespace-pre-wrap rounded-lg border border-line-light dark:border-line-dark p-3 font-sans">{withSignature("Dear customer, …", agentName, s)}</pre>
        </div>
      </section>

      <section className="card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold">Automatic replies</h2>
          <label className="text-xs flex items-center gap-2">Send at most one per customer every
            <input type="number" min={1} max={72} className="input !w-16" value={s.autoReply.cooldownHours} onChange={(e) => setS({ ...s, autoReply: { ...s.autoReply, cooldownHours: Number(e.target.value) || 1 } })} /> hours
          </label>
        </div>
        {AUTO_CHANNELS.map((c) => {
          const cfg = s.autoReply.channels[c];
          const set = (patch: Partial<typeof cfg>) => setS({ ...s, autoReply: { ...s.autoReply, channels: { ...s.autoReply.channels, [c]: { ...cfg, ...patch } } } });
          return (
            <div key={c} className="border-t border-line-light dark:border-line-dark pt-3">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> {AUTO_LABEL[c]}</label>
              <textarea className="input mt-2 w-full text-sm" rows={2} value={cfg.text} onChange={(e) => set({ text: e.target.value })} />
              <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-1">Customer sees: {autoReplyText(cfg.text, s.signature.bankName)}</p>
            </div>
          );
        })}
        <p className="text-[11px] text-ink-950/50 dark:text-surface/50">Use {"{bank}"} for the bank name. Auto-replies are labelled &ldquo;Auto-reply&rdquo; in the thread and don&rsquo;t count as an agent&rsquo;s response in reports. Replies only go out once the matching channel is connected.</p>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? "Saving…" : "Save"}</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-sla-breach"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
