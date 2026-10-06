"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { ChannelSettings } from "@/lib/channels/config";

type Urls = { email: string; sms: string; voice: string; meta: string; x: string; xCallback: string; screenpop: string };
type XState = { connected: boolean; username: string; userId: string; webhookId: string };
const X_FLASH: Record<string, string> = { connected: "X account connected. Next, click “Activate incoming messages”.", denied: "X sign-in was cancelled.", expired: "The X sign-in took too long — please try again.", missing: "Set CX360_X_CLIENT_ID and CX360_X_CLIENT_SECRET in Netlify first." };
type Msg = { ok: boolean; text: string } | null;
const inp = "input mt-1 text-sm";

function Var({ name, secrets }: { name: string; secrets: Record<string, boolean> }) {
  const ok = secrets[name];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] mr-3 ${ok ? "text-emerald-600" : "text-sla-warning"}`}>
      {ok ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}<code>CX360_{name}</code> {ok ? "set" : "not set"}
    </span>
  );
}
function Url({ label, value }: { label: string; value: string }) {
  return <div className="mt-2"><span className="text-xs font-medium">{label}</span><input readOnly className={`${inp} font-mono text-xs`} value={value} onFocus={(e) => e.currentTarget.select()} /></div>;
}
function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return <section className="card p-5"><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs text-ink-950/50 dark:text-surface/50 mb-2">{desc}</p>{children}</section>;
}

export function ChannelsClient({ initial, secrets, urls, x: xInitial, xFlash }: { initial: ChannelSettings; secrets: Record<string, boolean>; urls: Urls; x: XState; xFlash: { code: string; msg: string } | null }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = JSON.stringify({ ...s, x: 0 }) !== JSON.stringify({ ...saved, x: 0 });
  const [x, setX] = useState(xInitial);
  const [xBusy, setXBusy] = useState(false);
  const [xMsg, setXMsg] = useState<Msg>(xFlash ? { ok: xFlash.code === "connected", text: xFlash.code === "error" ? xFlash.msg || "Could not connect X." : X_FLASH[xFlash.code] ?? "" } : null);

  async function xCall(method: "POST" | "DELETE") {
    if (method === "DELETE" && !confirm("Disconnect X? New X messages will stop arriving. Existing conversations stay.")) return;
    setXBusy(true); setXMsg(null);
    try {
      const r = await fetch("/api/admin/channels/x", { method });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setX(d.x); setXMsg({ ok: true, text: method === "POST" ? "Incoming X messages are now switched on." : "X disconnected." }); router.refresh();
    } catch (e) {
      setXMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally { setXBusy(false); }
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/channels", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save");
      setS(d.settings); setSaved(d.settings); setMsg({ ok: true, text: "Saved." }); router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card title="Email" desc="Customer emails become Inbox items, and replies to a case number are attached to that case.">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.email.pollMailbox} onChange={(e) => setS({ ...s, email: { ...s.email, pollMailbox: e.target.checked } })} /> Read a Microsoft 365 mailbox every minute</label>
        {s.email.pollMailbox && (
          <label className="block mt-2"><span className="text-xs font-medium">Mailbox address</span>
            <input className={inp} placeholder="Leave blank to use the address emails are sent from" value={s.email.mailbox} onChange={(e) => setS({ ...s, email: { ...s.email, mailbox: e.target.value } })} />
            <span className="block text-[11px] text-ink-950/50 dark:text-surface/50 mt-0.5">Needs Microsoft 365 as the email service (Notification centre → Delivery) and the Mail.ReadWrite permission for the app.</span>
          </label>
        )}
        <p className="text-xs text-ink-950/60 dark:text-surface/60 mt-3">Not on Microsoft 365? Have your mail system POST each email to:</p>
        <Url label="Email address (webhook)" value={urls.email} />
        <div className="mt-2"><Var name="INBOUND_TOKEN" secrets={secrets} /></div>
      </Card>

      <Card title="SMS replies" desc="Customers replying to the bank's SMS number. The SMS gateway forwards each reply to this address.">
        <Url label="SMS reply address (webhook)" value={urls.sms} />
        <div className="mt-2"><Var name="INBOUND_TOKEN" secrets={secrets} /></div>
      </Card>

      <Card title="WhatsApp Business" desc="Customer WhatsApp messages arrive in the Inbox; agents can reply within 24 hours of the customer's last message.">
        <label className="block"><span className="text-xs font-medium">Phone number ID</span>
          <input className={`${inp} font-mono`} inputMode="numeric" value={s.whatsapp.phoneNumberId} onChange={(e) => setS({ ...s, whatsapp: { phoneNumberId: e.target.value } })} />
          <span className="block text-[11px] text-ink-950/50 dark:text-surface/50 mt-0.5">Meta developer dashboard → WhatsApp → API setup.</span>
        </label>
        <Url label="Webhook address (give to Meta)" value={urls.meta} />
        <div className="mt-2"><Var name="META_VERIFY_TOKEN" secrets={secrets} /><Var name="META_APP_SECRET" secrets={secrets} /><Var name="WHATSAPP_TOKEN" secrets={secrets} /></div>
      </Card>

      <Card title="Instagram and Messenger" desc="Direct messages only. Uses the same Meta app and webhook address as WhatsApp.">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.meta.instagram} onChange={(e) => setS({ ...s, meta: { ...s.meta, instagram: e.target.checked } })} /> Instagram DMs</label>
        <label className="flex items-center gap-2 text-sm mt-1"><input type="checkbox" checked={s.meta.messenger} onChange={(e) => setS({ ...s, meta: { ...s.meta, messenger: e.target.checked } })} /> Facebook Messenger</label>
        <label className="block mt-2"><span className="text-xs font-medium">Facebook Page ID</span>
          <input className={`${inp} font-mono`} inputMode="numeric" value={s.meta.pageId} onChange={(e) => setS({ ...s, meta: { ...s.meta, pageId: e.target.value } })} />
        </label>
        <div className="mt-2"><Var name="META_PAGE_TOKEN" secrets={secrets} /></div>
        <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-2">Meta must approve the app for messaging before real customers can use these. X (Twitter) and TikTok are not connected yet; LinkedIn does not allow it.</p>
      </Card>

      <Card title="X (Twitter)" desc="Direct messages to your bank's X account arrive in the Inbox, and agents reply from there. X charges per message (about $0.01 received, $0.015 sent). Encrypted X chats can't be read.">
        <div className="text-sm">
          {x.connected ? <>Connected as <strong>@{x.username || x.userId}</strong>. {x.webhookId ? <span className="text-emerald-600">Incoming messages are on.</span> : <span className="text-sla-warning">Incoming messages are not on yet.</span>}</> : "No X account connected."}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <a href="/api/channels/x/connect" className="btn-secondary text-xs !px-3 !py-1.5">{x.connected ? "Reconnect X account" : "Connect X account"}</a>
          {x.connected && <button className="btn-primary text-xs !px-3 !py-1.5" disabled={xBusy} onClick={() => xCall("POST")}>{x.webhookId ? "Re-check incoming messages" : "Activate incoming messages"}</button>}
          {x.connected && <button className="btn-ghost text-xs !px-3 !py-1.5" disabled={xBusy} onClick={() => xCall("DELETE")}>Disconnect</button>}
        </div>
        {xMsg && <p className={`text-sm mt-2 ${xMsg.ok ? "text-emerald-600" : "text-sla-breach"}`}>{xMsg.text}</p>}
        <Url label="Callback address (paste into your X app's settings)" value={urls.xCallback} />
        <Url label="Webhook address (the app registers this with X for you)" value={urls.x} />
        <div className="mt-2"><Var name="X_CLIENT_ID" secrets={secrets} /><Var name="X_CLIENT_SECRET" secrets={secrets} /><Var name="TOKEN_KEY" secrets={secrets} /></div>
        <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-2">Set up the app at developer.x.com with OAuth 2.0 and read + write + direct message permissions, then add credits in the X developer console.</p>
      </Card>

      <Card title="Phone system (Avaya)" desc="Two parts: a pop-up with the caller's history when an agent answers, and a call log sent after each call.">
        <Url label="Screen-pop address (the caller's number goes after ani=)" value={urls.screenpop} />
        <Url label="Call log address (webhook)" value={urls.voice} />
        <div className="mt-2"><Var name="INBOUND_TOKEN" secrets={secrets} /></div>
        <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-2">Call log body (JSON): callId, from, to, direction (inbound/outbound), durationSec, startedAt, agentEmail, disposition. Send the token in the <code>x-cx360-token</code> header.</p>
      </Card>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-sla-breach"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
