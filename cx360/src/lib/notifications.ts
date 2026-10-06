import { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export type NotificationChannel = "email" | "sms" | "whatsapp" | "instagram" | "messenger" | "x";

export type SendNotificationInput = {
  tenantId: string;
  channel: NotificationChannel;
  to: string; // email address or phone number
  subject?: string; // email only
  message: string;
  relatedCaseId?: string;
  /** Copied addresses (email only). */
  cc?: string[];
  /** Which template this came from, e.g. "case.opened.email" — lets the log be filtered and escalations be traced. */
  kind?: string;
};

const joinCc = (cc?: string[]) => (cc && cc.length ? cc.join(", ") : undefined);

/**
 * The single layer every notification in CX360 routes through — customer
 * "case opened"/"case closed" messages (src/lib/case-service.ts), unit
 * escalation emails (also case-service.ts), and SLA-triggered messages
 * fired by a workflow rule's `notify` action (src/lib/workflow-engine.ts).
 * One place to look at what fired, and one place to wire a real provider.
 *
 * There's no email/SMS provider configured in this environment (no
 * SendGrid/Twilio/etc. credentials), so this logs the attempt to
 * NotificationLog with status "queued"; the dispatch-notifications job delivers it and retries failures.
 * Wiring a real provider is a one-function change:
 *
 *   if (input.channel === "email") await sendGridClient.send({ ... });
 *   if (input.channel === "sms") await twilioClient.messages.create({ ... });
 *
 * ...right where the `console.log` line is below, then flip status to
 * "sent"/"failed" based on the provider's response.
 */
export async function sendNotification(tx: Tx, input: SendNotificationInput): Promise<{ ok: boolean }> {
  console.log(`[notification:${input.channel}] to=${input.to}${input.cc?.length ? ` cc=${input.cc.join(",")}` : ""} ${input.subject ? `subject="${input.subject}" ` : ""}message="${input.message}"`);

  await tx.notificationLog.create({
    data: {
      tenantId: input.tenantId,
      channel: input.channel,
      to: input.to,
      subject: input.subject,
      message: input.message,
      relatedCaseId: input.relatedCaseId,
      cc: joinCc(input.cc),
      kind: input.kind,
      status: "queued",
    },
  });

  return { ok: true };
}

/**
 * Bulk variant for jobs that notify many customers at once (batch close).
 * Same log row per message as sendNotification, but in ONE database call, so
 * closing hundreds of cases doesn't mean hundreds of round trips. When a real
 * email/SMS provider is wired in, hand it these same inputs here.
 */
export async function sendNotificationsBulk(tx: Tx, inputs: SendNotificationInput[]) {
  if (inputs.length === 0) return;
  console.log(`[notification:bulk] ${inputs.length} message(s)`);
  await tx.notificationLog.createMany({
    data: inputs.map((i) => ({
      tenantId: i.tenantId,
      channel: i.channel,
      to: i.to,
      subject: i.subject,
      message: i.message,
      relatedCaseId: i.relatedCaseId,
      cc: joinCc(i.cc),
      kind: i.kind,
      status: "queued",
    })),
  });
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
