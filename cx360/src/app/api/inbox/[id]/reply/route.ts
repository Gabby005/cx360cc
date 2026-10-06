import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { sendNotification, type NotificationChannel } from "@/lib/notifications";
import { REPLY_WINDOW_MS } from "@/lib/channels/meta";

const replySchema = z.object({ message: z.string().min(1).max(4000) });

/** Channels CX360 can really send on. Voice, chat, portal and the generic "social" type are record-only. */
const SENDABLE: Record<string, NotificationChannel> = { EMAIL: "email", SMS: "sms", WHATSAPP: "whatsapp", INSTAGRAM: "instagram", MESSENGER: "messenger", X: "x" };
const socialKey = (c: string) => (c === "INSTAGRAM" ? "instagramId" : c === "MESSENGER" ? "messengerId" : c === "X" ? "xId" : null);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const body = replySchema.parse(await req.json());

    const original = await prisma.interaction.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      include: { customer: { select: { email: true, phone: true, customFields: true } }, case: { select: { caseNumber: true } } },
    });
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const sendChannel = SENDABLE[original.channel];
    let to: string | null = null;
    if (sendChannel) {
      const sk = socialKey(original.channel);
      const cf = (original.customer.customFields ?? {}) as Record<string, unknown>;
      to = original.contact
        ?? (sendChannel === "email" ? original.customer.email : sk ? (typeof cf[sk] === "string" ? (cf[sk] as string) : null) : original.customer.phone);
      if (!to) return NextResponse.json({ error: "There is no address or number on file to reply to for this customer." }, { status: 400 });

      // WhatsApp / Instagram / Messenger only allow free replies for 24 hours after the customer's last message.
      if (sendChannel === "whatsapp" || sendChannel === "instagram" || sendChannel === "messenger") {
        const last = await prisma.interaction.findFirst({
          where: { tenantId: ctx.tenantId, customerId: original.customerId, channel: original.channel, direction: "inbound" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        if (!last || Date.now() - last.createdAt.getTime() > REPLY_WINDOW_MS) {
          return NextResponse.json({ error: "The 24-hour reply window has closed — the platform only allows a reply within 24 hours of the customer's last message. Contact them by phone, SMS or email instead." }, { status: 400 });
        }
      }
    }

    const subject = original.subject ? (/^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`) : original.case ? `Re: ${original.case.caseNumber}` : "Reply from the bank";
    const message = sendChannel === "email" && original.case && !body.message.includes(original.case.caseNumber)
      ? `${body.message}\n\nReference: ${original.case.caseNumber}`
      : body.message;

    const [, reply] = await prisma.$transaction(async (tx) => {
      const upd = await tx.interaction.update({
        where: { id: original.id },
        data: { status: original.status === "NEW" ? "IN_PROGRESS" : original.status, agentId: ctx.userId },
      });
      const created = await tx.interaction.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: original.customerId,
          agentId: ctx.userId,
          channel: original.channel,
          direction: "outbound",
          status: "IN_PROGRESS",
          summary: body.message,
          caseId: original.caseId,
          contact: to ?? original.contact,
          subject: sendChannel === "email" ? subject : original.subject,
        },
      });
      if (sendChannel && to) {
        await sendNotification(tx, { tenantId: ctx.tenantId, channel: sendChannel, to, subject: sendChannel === "email" ? subject : undefined, message, relatedCaseId: original.caseId ?? undefined, kind: "inbox.reply" });
      }
      return [upd, created] as const;
    });

    return NextResponse.json({ reply, delivered: sendChannel ? "queued" : "recorded-only" }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
