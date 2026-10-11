import { Prisma, PrismaClient, Channel } from "@prisma/client";
import { sendNotification, type NotificationChannel } from "@/lib/notifications";
import { parseMessaging, autoReplyText, isRobotAddress, type AutoChannel } from "@/lib/messaging";

type Db = PrismaClient | Prisma.TransactionClient;

const VIA: Record<string, NotificationChannel> = { EMAIL: "email", WHATSAPP: "whatsapp", SMS: "sms", INSTAGRAM: "instagram", MESSENGER: "messenger", X: "x" };

/**
 * Sends the automatic "we received your message" reply, at most once per
 * customer per channel within the cooldown (default 6 hours), so a customer
 * who sends five lines gets one auto-reply, not five.
 * The reply is stored as an outbound row whose externalId starts with "auto:",
 * which keeps it out of response-time and "followed up" reports.
 */
export async function maybeAutoReply(
  db: Db,
  tenantId: string,
  m: { customerId: string; channel: Channel; contact: string; subject?: string; interactionId: string; missedCall: boolean; socialKey?: string },
): Promise<boolean> {
  const key = m.channel as AutoChannel;
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { messagingSettings: true } });
  const s = parseMessaging(t?.messagingSettings);
  const cfg = s.autoReply.channels[key];
  if (!cfg?.enabled) return false;

  // Phone calls are answered by SMS; every other channel replies where the customer wrote.
  const sendChannel = m.channel === "VOICE" ? "SMS" : m.channel;
  const via = VIA[sendChannel];
  if (!via) return false;
  if (m.channel === "VOICE" && !m.missedCall) return false;
  if (via === "email" && isRobotAddress(m.contact)) return false;
  if (!m.contact || m.contact.length > 200) return false;

  // Safety valve: never more than 300 automatic replies an hour for the whole bank (stops a message storm or a reply loop).
  const storm = await db.interaction.count({ where: { tenantId, direction: "outbound", externalId: { startsWith: "auto:" }, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (storm >= 300) return false;

  const since = new Date(Date.now() - s.autoReply.cooldownHours * 3_600_000);
  const recent = await db.interaction.findFirst({
    where: { tenantId, customerId: m.customerId, channel: sendChannel as Channel, direction: "outbound", externalId: { startsWith: "auto:" }, createdAt: { gte: since } },
    select: { id: true },
  });
  if (recent) return false;

  const text = autoReplyText(cfg.text, s.signature.bankName);
  const subject = via === "email" ? (m.subject ? (/^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`) : `We received your message — ${s.signature.bankName}`) : undefined;
  await db.interaction.create({
    data: {
      tenantId,
      customerId: m.customerId,
      channel: sendChannel as Channel,
      direction: "outbound",
      status: "CLOSED",
      summary: `[Auto-reply] ${text}`.slice(0, 600),
      contact: m.contact,
      subject: subject ?? null,
      externalId: `auto:${m.interactionId}`,
      readAt: new Date(),
    },
  });
  await sendNotification(db, { tenantId, channel: via, to: m.contact, subject, message: text, kind: "auto.reply" });
  return true;
}
