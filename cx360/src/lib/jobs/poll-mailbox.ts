import { prisma } from "@/lib/prisma";
import { parseDeliverySettings } from "@/lib/delivery/config";
import { parseChannelSettings } from "@/lib/channels/config";
import { ingestInbound } from "@/lib/channels/ingest";
import { pollMailbox } from "@/lib/channels/graph-inbox";

/** Turns new mail in the support mailbox into Inbox items (Microsoft 365 via Graph). Does nothing until switched on in Admin → Channels. */
export async function runPollMailbox() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, channelSettings: true, deliverySettings: true } });
  const deadline = Date.now() + 15_000;
  let processed = 0, skipped = 0, mailboxes = 0;
  const errors: string[] = [];

  for (const t of tenants) {
    const ch = parseChannelSettings(t.channelSettings);
    if (!ch.email.pollMailbox) continue;
    const d = parseDeliverySettings(t.deliverySettings);
    if (d.email.provider !== "graph") { errors.push("Mailbox reading needs the Microsoft 365 email connection (Delivery settings)."); continue; }
    const mailbox = ch.email.mailbox || d.email.sender;
    if (!mailbox) { errors.push("No mailbox set."); continue; }
    mailboxes++;
    const r = await pollMailbox(d.email, mailbox, [mailbox, d.email.sender], async (m) => {
      await ingestInbound(t.id, m);
      return true;
    }, { deadline });
    processed += r.processed; skipped += r.skipped;
    if (!r.ok && r.error) errors.push(r.error);
  }
  if (errors.length) throw new Error(errors[0]); // recorded on System health as a failed run
  return { mailboxes, processed, skipped };
}
