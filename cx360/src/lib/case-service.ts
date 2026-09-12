import { Prisma, PrismaClient, CaseType, Priority } from "@prisma/client";
import { ApiError } from "./tenant";
import { notifyCustomer, sendNotification } from "./notifications";

type Tx = Prisma.TransactionClient | PrismaClient;

// Segment of the case number that identifies the interaction type, e.g.
// "PTB/COM/E0006/000123". Not admin-configurable by design — these are
// short, stable codes tied to the CaseType enum itself; the taxonomy that
// IS admin-managed is CaseCode (category/subcategory codes like "E0006").
const TYPE_CODE: Record<CaseType, string> = {
  COMPLAINT: "COM",
  SERVICE_REQUEST: "REQ",
  INQUIRY: "ENQ",
  INCIDENT: "INC",
};

export type CreateCaseInput = {
  tenantId: string;
  customerId: string;
  type: CaseType;
  priority: Priority;
  subject: string;
  /** Required at the API/form layer (every case needs an initial comment) — kept optional here since this is a shared service, not the validator. */
  description?: string;
  category?: string;
  /** Resolves to an approved CaseCode row; its `code` becomes part of the case number. */
  caseCodeId?: string;
  isTransactional?: boolean;
  transactionAmount?: number;
  transactionCurrency?: string;
  /** If set (and isTransactional is true), fires an escalation email to that Unit on creation. */
  escalatedUnitId?: string;
  queueId?: string;
  /** Who created this case, for the audit trail. Omitted for API-key-created cases. */
  actorId?: string;
};

/**
 * Generates the next case number for a tenant in the format
 * "{TenantPrefix}/{TypeCode}/{CaseCode}/{Sequence}", e.g.
 * "PTB/COM/E0006/000123". Falls back to "GEN" for the code segment when
 * no CaseCode was selected (e.g. a type that doesn't have codes set up
 * yet), so the format stays consistent rather than having a ragged
 * three-segment number for some cases and four for others.
 *
 * Uses an atomic increment on Tenant.caseSequence so concurrent case
 * creation can never produce a duplicate number — the
 * @@unique([tenantId, caseNumber]) constraint on Case is a backstop, not
 * the primary defense.
 */
async function nextCaseNumber(tx: Tx, tenantId: string, type: CaseType, codeSegment: string): Promise<string> {
  const tenant = await tx.tenant.update({
    where: { id: tenantId },
    data: { caseSequence: { increment: 1 } },
    select: { caseSequence: true, caseNumberPrefix: true },
  });
  const seq = String(tenant.caseSequence).padStart(6, "0");
  return `${tenant.caseNumberPrefix}/${TYPE_CODE[type]}/${codeSegment}/${seq}`;
}

/**
 * Writes an AuditLog entry. Used for every lifecycle change (creation,
 * status/priority/assignment changes, batch closure) so the case detail
 * page can show a real "who changed what, when" timeline — not just the
 * customer-facing interaction log.
 */
export async function logCaseActivity(
  tx: Tx,
  params: {
    tenantId: string;
    caseId: string;
    actorId?: string;
    action: string; // e.g. "created", "status_changed", "reassigned", "batch_closed"
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }
) {
  await tx.auditLog.create({
    data: {
      tenantId: params.tenantId,
      actorId: params.actorId,
      action: params.action,
      entity: "Case",
      entityId: params.caseId,
      before: (params.before ?? undefined) as unknown as Prisma.InputJsonValue,
      after: (params.after ?? undefined) as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Creates a Case with its case number and SLA clock stamped at creation
 * time, writes the corresponding domain event, logs the creation to the
 * audit trail, notifies the customer their ticket was opened (email +
 * SMS via src/lib/notifications.ts), and — if this is a transactional
 * case with a Unit selected — fires an escalation email to that unit.
 * This is the single place all of this logic lives, so every entry point
 * that can create a case (the Cases API, the New Case form, the Inbox's
 * "convert to case" action, and the external v1 API) gets identical
 * behavior for free.
 */
export async function createCase(tx: Tx, input: CreateCaseInput) {
  let codeSegment = "GEN";
  if (input.caseCodeId) {
    const caseCode = await tx.caseCode.findFirst({ where: { id: input.caseCodeId, tenantId: input.tenantId } });
    if (!caseCode) {
      throw new ApiError(400, "Selected case code was not found.");
    }
    if (caseCode.type !== input.type) {
      throw new ApiError(
        400,
        `That case code belongs to ${caseCode.type.toLowerCase().replace("_", " ")}, not ${input.type.toLowerCase().replace("_", " ")}.`
      );
    }
    if (!caseCode.active) {
      throw new ApiError(400, "That case code has been deactivated.");
    }
    codeSegment = caseCode.code;
  }

  let unit: { id: string; name: string; email: string } | null = null;
  if (input.isTransactional && input.escalatedUnitId) {
    unit = await tx.unit.findFirst({ where: { id: input.escalatedUnitId, tenantId: input.tenantId, active: true } });
    if (!unit) {
      throw new ApiError(400, "Selected escalation unit was not found or is inactive.");
    }
  }

  const [policy, caseNumber, customer] = await Promise.all([
    tx.slaPolicy.findUnique({
      where: { tenantId_priority: { tenantId: input.tenantId, priority: input.priority } },
    }),
    nextCaseNumber(tx, input.tenantId, input.type, codeSegment),
    tx.customer.findFirst({ where: { id: input.customerId, tenantId: input.tenantId } }),
  ]);

  const now = new Date();
  const newCase = await tx.case.create({
    data: {
      tenantId: input.tenantId,
      caseNumber,
      customerId: input.customerId,
      type: input.type,
      priority: input.priority,
      subject: input.subject,
      description: input.description,
      category: input.category,
      caseCodeId: input.caseCodeId,
      isTransactional: input.isTransactional ?? false,
      transactionAmount: input.transactionAmount,
      transactionCurrency: input.transactionCurrency,
      escalatedUnitId: unit?.id,
      escalatedAt: unit ? now : undefined,
      queueId: input.queueId,
      slaPolicyId: policy?.id,
      responseDueAt: policy ? new Date(now.getTime() + policy.responseMinutes * 60_000) : null,
      resolutionDueAt: policy ? new Date(now.getTime() + policy.resolutionMinutes * 60_000) : null,
    },
  });

  await tx.event.create({
    data: {
      tenantId: input.tenantId,
      type: input.type === "COMPLAINT" ? "complaint.created" : "case.created",
      payload: { caseId: newCase.id, caseNumber: newCase.caseNumber, priority: newCase.priority },
    },
  });

  await logCaseActivity(tx, {
    tenantId: input.tenantId,
    caseId: newCase.id,
    actorId: input.actorId,
    action: "created",
    after: { status: newCase.status, priority: newCase.priority },
  });

  if (customer) {
    await notifyCustomer(tx, {
      tenantId: input.tenantId,
      email: customer.email,
      phone: customer.phone,
      subject: `Your ticket ${newCase.caseNumber} has been opened`,
      message: `Hi ${customer.firstName}, we've opened ticket ${newCase.caseNumber} for "${newCase.subject}". We'll keep you updated as it progresses.`,
      relatedCaseId: newCase.id,
    });
  }

  if (unit) {
    await sendNotification(tx, {
      tenantId: input.tenantId,
      channel: "email",
      to: unit.email,
      subject: `Transactional case escalated: ${newCase.caseNumber}`,
      message: `A transactional case has been escalated to ${unit.name}.\n\nCase: ${newCase.caseNumber}\nSubject: ${newCase.subject}\nAmount: ${input.transactionCurrency ?? ""} ${input.transactionAmount ?? "—"}\nCustomer: ${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`,
      relatedCaseId: newCase.id,
    });
  }

  return newCase;
}

/**
 * Notifies the customer their ticket has been closed. Called from both
 * the single-case PATCH route and the batch-close route — the two
 * places a case's status can become CLOSED — so both paths behave
 * identically.
 */
export async function notifyCaseClosed(tx: Tx, tenantId: string, caseId: string) {
  const kase = await tx.case.findFirst({ where: { id: caseId, tenantId }, include: { customer: true } });
  if (!kase) return;

  await notifyCustomer(tx, {
    tenantId,
    email: kase.customer.email,
    phone: kase.customer.phone,
    subject: `Your ticket ${kase.caseNumber} has been closed`,
    message: `Hi ${kase.customer.firstName}, ticket ${kase.caseNumber} ("${kase.subject}") has been closed. If you still need help, just reach out and we'll reopen it.`,
    relatedCaseId: kase.id,
  });
}

/**
 * Reopens a closed case instead of forcing a brand-new one for the same
 * underlying issue (e.g. the customer calls back about something already
 * marked resolved). Keeps the original case number and full history —
 * the new activity just continues on the same record — and tracks how
 * many times a case has been reused, which is itself a useful quality
 * signal (a case reopened repeatedly may not have been properly resolved).
 */
export async function reopenCase(tx: Tx, tenantId: string, caseId: string, actorId: string) {
  const existing = await tx.case.findFirst({ where: { id: caseId, tenantId } });
  if (!existing) {
    throw new ApiError(404, "Case not found.");
  }
  if (existing.status !== "CLOSED") {
    throw new ApiError(400, "Only closed cases can be reused.");
  }

  const updated = await tx.case.update({
    where: { id: existing.id },
    data: {
      status: "OPEN",
      closedAt: null,
      resolvedAt: null,
      reopenedCount: { increment: 1 },
    },
  });

  await logCaseActivity(tx, {
    tenantId,
    caseId: existing.id,
    actorId,
    action: "reopened",
    before: { status: "CLOSED" },
    after: { status: "OPEN" },
  });

  return updated;
}
