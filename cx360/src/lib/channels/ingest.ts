import { Prisma, PrismaClient, Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logCaseActivity } from "@/lib/case-service";
import { clip, extractCaseNumber, phoneKey } from "./text";

type Db = PrismaClient | Prisma.TransactionClient;

export type InboundMessage = {
  channel: Channel;
  /** Provider's id for this message — a re-delivered message is stored once. */
  externalId: string;
  /** Address / number / social id of the other party. */
  contact: string;
  name?: string;
  subject?: string;
  body: string;
  receivedAt?: Date;
  direction?: "inbound" | "outbound";
  durationSec?: number;
  /** Voice: email of the agent who took the call. */
  agentEmail?: string;
  /** Voice: skip the "new" queue (answered calls are just history). */
  historyOnly?: boolean;
  /** Social: the key in customer details that holds this person's platform id. */
  socialKey?: "instagramId" | "messengerId";
};

export type IngestResult = { id: string | null; customerId: string | null; duplicate: boolean; linkedCaseId: string | null; createdCustomer: boolean; flagged?: boolean };

const FLOOD_PER_HOUR = 30;
const isEmail = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

/** Finds the customer for a contact point, or null. Phone matching ignores formatting (last 10 digits). */
export async function findCustomer(db: Db, tenantId: string, m: Pick<InboundMessage, "channel" | "contact" | "socialKey">): Promise<string | null> {
  if (m.socialKey) {
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE "tenantId" = ${tenantId} AND "customFields"->>${m.socialKey} = ${m.contact} LIMIT 1`;
    return rows[0]?.id ?? null;
  }
  if (isEmail(m.contact)) {
    const c = await db.customer.findFirst({ where: { tenantId, email: { equals: m.contact, mode: "insensitive" } }, select: { id: true } });
    return c?.id ?? null;
  }
  const key = phoneKey(m.contact);
  if (key.length < 7) return null;
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE "tenantId" = ${tenantId} AND right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${key} LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function ingestInbound(tenantId: string, m: InboundMessage, db: Db = prisma): Promise<IngestResult> {
  const dup = await db.interaction.findFirst({ where: { tenantId, channel: m.channel, externalId: m.externalId }, select: { id: true, customerId: true, caseId: true } });
  if (dup) return { id: dup.id, customerId: dup.customerId, duplicate: true, linkedCaseId: dup.caseId, createdCustomer: false };

  let customerId = await findCustomer(db, tenantId, m);
  let createdCustomer = false;
  if (!customerId) {
    const parts = (m.name ?? "").trim().split(/\s+/).filter(Boolean);
    const email = isEmail(m.contact);
    const social = m.socialKey;
    const created = await db.customer.create({
      data: {
        tenantId,
        firstName: clip(parts[0] ?? "Unknown", 60),
        lastName: clip(parts.slice(1).join(" ") || (email ? m.contact : social ? m.channel === "INSTAGRAM" ? "(Instagram)" : "(Messenger)" : m.contact), 80),
        email: email ? m.contact : null,
        phone: !email && !social ? m.contact : null,
        segment: "Unverified",
        customFields: { autoCreated: true, source: m.channel.toLowerCase(), ...(social ? { [social]: m.contact } : {}) },
      },
      select: { id: true },
    });
    customerId = created.id;
    createdCustomer = true;
  }

  // Replies to a ticket email carry its number in the subject — attach them to that ticket.
  const caseNo = extractCaseNumber(`${m.subject ?? ""}\n${m.body.slice(0, 500)}`);
  const linked = caseNo ? await db.case.findFirst({ where: { tenantId, caseNumber: caseNo }, select: { id: true } }) : null;

  const outbound = m.direction === "outbound";
  let flagged = false;
  if (!outbound && !m.historyOnly) {
    const recent = await db.interaction.count({ where: { tenantId, customerId, channel: m.channel, direction: "inbound", createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
    flagged = recent >= FLOOD_PER_HOUR;
  }

  const agent = m.agentEmail ? await db.user.findFirst({ where: { email: { equals: m.agentEmail, mode: "insensitive" }, memberships: { some: { tenantId } } }, select: { id: true } }) : null;

  const status = flagged || m.historyOnly || outbound ? "CLOSED" : linked ? "LINKED" : "NEW";
  try {
    const row = await db.interaction.create({
      data: {
        tenantId,
        customerId,
        agentId: agent?.id ?? null,
        channel: m.channel,
        direction: outbound ? "outbound" : "inbound",
        status,
        summary: flagged ? "[Auto-closed: too many messages in an hour] " + clip(m.subject || m.body, 100) : clip((m.subject || m.body).replace(/\s+/g, " "), 140),
        transcript: clip(m.body, 8000),
        subject: m.subject ? clip(m.subject, 300) : null,
        contact: clip(m.contact, 200),
        externalId: m.externalId,
        durationSec: m.durationSec ?? null,
        caseId: linked?.id ?? null,
        ...(m.receivedAt ? { createdAt: m.receivedAt } : {}),
      },
      select: { id: true },
    });
    if (linked && !outbound) {
      await logCaseActivity(db, { tenantId, caseId: linked.id, action: "customer_replied", after: { channel: m.channel.toLowerCase() } }).catch(() => {});
    }
    return { id: row.id, customerId, duplicate: false, linkedCaseId: linked?.id ?? null, createdCustomer, flagged };
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return { id: null, customerId, duplicate: true, linkedCaseId: null, createdCustomer };
    throw err;
  }
}
