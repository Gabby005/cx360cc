import { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export type NotificationChannel = "email" | "sms";

export type SendNotificationInput = {
  tenantId: string;
  channel: NotificationChannel;
  to: string; // email address or phone number
  subject?: string; // email only
  message: string;
  relatedCaseId?: string;
};

/**
 * The single layer every notification in CX360 routes through — customer
 * "case opened"/"case closed" messages (src/lib/case-service.ts), unit
 * escalation emails (also case-service.ts), and SLA-triggered messages
 * fired by a workflow rule's `notify` action (src/lib/workflow-engine.ts).
 * One place to look at what fired, and one place to wire a real provider.
 *
 * There's no email/SMS provider configured in this environment (no
 * SendGrid/Twilio/etc. credentials), so this logs the attempt to
 * NotificationLog with status "logged" rather than pretending to send.
 * Wiring a real provider is a one-function change:
 *
 *   if (input.channel === "email") await sendGridClient.send({ ... });
 *   if (input.channel === "sms") await twilioClient.messages.create({ ... });
 *
 * ...right where the `console.log` line is below, then flip status to
 * "sent"/"failed" based on the provider's response.
 */
export async function sendNotification(tx: Tx, input: SendNotificationInput): Promise<{ ok: boolean }> {
  console.log(`[notification:${input.channel}] to=${input.to} ${input.subject ? `subject="${input.subject}" ` : ""}message="${input.message}"`);

  await tx.notificationLog.create({
    data: {
      tenantId: input.tenantId,
      channel: input.channel,
      to: input.to,
      subject: input.subject,
      message: input.message,
      relatedCaseId: input.relatedCaseId,
      status: "logged",
    },
  });

  return { ok: true };
}

/** Convenience wrapper — sends the same message on both channels if both contact points exist. */
export async function notifyCustomer(
  tx: Tx,
  params: {
    tenantId: string;
    email?: string | null;
    phone?: string | null;
    subject: string;
    message: string;
    relatedCaseId?: string;
  }
) {
  if (params.email) {
    await sendNotification(tx, {
      tenantId: params.tenantId,
      channel: "email",
      to: params.email,
      subject: params.subject,
      message: params.message,
      relatedCaseId: params.relatedCaseId,
    });
  }
  if (params.phone) {
    await sendNotification(tx, {
      tenantId: params.tenantId,
      channel: "sms",
      to: params.phone,
      message: params.message,
      relatedCaseId: params.relatedCaseId,
    });
  }
}
