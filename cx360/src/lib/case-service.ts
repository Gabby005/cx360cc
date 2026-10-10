import { Prisma, PrismaClient, CaseType, Priority, CaseStatus } from "@prisma/client";
import { ApiError } from "./tenant";
import { notifyCaseStage, sendUnitEscalationEmail } from "./notify";
import { statusRequiresUnit } from "./case-status";
import { addBusinessMinutes, parseBusinessHours } from "@/lib/business-hours";

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
  /** Defaults to NEW. Choosing PENDING_BANK/PENDING_THIRD_PARTY requires escalatedUnitId. */
  status?: CaseStatus;
  isTransactional?: boolean;
  transactionAmount?: number;
  transactionCurrency?: string;
  /** Required if status is PENDING_BANK/PENDING_THIRD_PARTY; optional otherwise (e.g. a transactional case that just wants a unit informed). */
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
 * Validates a Unit and sends the escalation email — shared by case
 * creation (whenever a unit is chosen — any case, transactional or not)
 * and by the PATCH route (when an existing case's status changes to
 * something that requires one). One place, so the notification content
 * and the "must be active" check never drift between the two call sites.
 */
export async function escalateToUnit(
  tx: Tx,
  params: { tenantId: string; unitId: string; caseId: string; caseNumber: string; subject: string; customerName: string }
) {
  const unit = await tx.unit.findFirst({ where: { id: params.unitId, tenantId: params.tenantId, active: true } });
  if (!unit) {
    throw new ApiError(400, "Selected escalation unit was not found or is inactive.");
  }

  await tx.case.update({
    where: { id: params.caseId },
    data: { escalatedUnitId: unit.id, escalatedAt: new Date() },
  });

  await sendUnitEscalationEmail(tx, { tenantId: params.tenantId, caseId: params.caseId, unit: { name: unit.name, email: unit.email } });

  return unit;
}

/**
 * Creates a Case with its case number and SLA clock stamped at creation
 * time, writes the corresponding domain event, logs the creation to the
 * audit trail, notifies the customer their ticket was opened (email +
 * SMS via src/lib/notifications.ts), and — if a Unit was selected (either
 * because the case is transactional or because the chosen initial status
 * requires one) — fires an escalation email to that unit. This is the
 * single place all of this logic lives, so every entry point that can
 * create a case (the Cases API, the New Case form, the Inbox's "convert
 * to case" action, and the external v1 API) gets identical behavior.
 */
export async function createCase(tx: Tx, input: CreateCaseInput) {
  const status = input.status ?? "NEW";

  if (statusRequiresUnit(status) && !input.escalatedUnitId) {
    throw new ApiError(400, `Status "${status.replace(/_/g, " ")}" requires selecting a unit.`);
  }

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

  const [policy, caseNumber, customer] = await Promise.all([
    tx.slaPolicy.findUnique({
      where: { tenantId_priority: { tenantId: input.tenantId, priority: input.priority } },
    }),
    nextCaseNumber(tx, input.tenantId, input.type, codeSegment),
    tx.customer.findFirst({ where: { id: input.customerId, tenantId: input.tenantId } }),
  ]);

  const now = new Date();
  // Business-hours policies count only open time toward the due dates (weekends, nights and holidays are skipped).
  const hours = policy?.businessHoursOnly
    ? parseBusinessHours((await tx.tenant.findUnique({ where: { id: input.tenantId }, select: { businessHours: true } }))?.businessHours)
    : null;
  const dueAfter = (minutes: number) => (hours ? addBusinessMinutes(now, minutes, hours) : new Date(now.getTime() + minutes * 60_000));
  const newCase = await tx.case.create({
    data: {
      tenantId: input.tenantId,
      caseNumber,
      customerId: input.customerId,
      type: input.type,
      priority: input.priority,
      status,
      subject: input.subject,
      description: input.description,
      category: input.category,
      caseCodeId: input.caseCodeId,
      isTransactional: input.isTransactional ?? false,
      transactionAmount: input.transactionAmount,
      transactionCurrency: input.transactionCurrency,
      queueId: input.queueId,
      createdById: input.actorId,
      slaPolicyId: policy?.id,
      responseDueAt: policy ? dueAfter(policy.responseMinutes) : null,
      resolutionDueAt: policy ? dueAfter(policy.resolutionMinutes) : null,
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
    // Email + SMS "ticket logged", from the editable templates (Admin → Notifications).
    await notifyCaseStage(tx, input.tenantId, newCase.id, "opened");
  }

  if (input.escalatedUnitId) {
    await escalateToUnit(tx, {
      tenantId: input.tenantId,
      unitId: input.escalatedUnitId,
      caseId: newCase.id,
      caseNumber: newCase.caseNumber,
      subject: newCase.subject,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
    });
  }

  return newCase;
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


/**
 * "Reuse this ticket": starts a NEW ticket (new case number, fresh SLA clock) for the same customer,
 * pre-filled with the closed ticket's details (subject, type, priority, case code, description, transaction details).
 * Both tickets get a note and a history entry pointing at each other, so the link is never lost.
 * Only closed tickets can be reused.
 */
export async function reuseCase(tx: Tx, tenantId: string, caseId: string, actorId: string) {
  const old = await tx.case.findFirst({ where: { id: caseId, tenantId } });
  if (!old) throw new ApiError(404, "Case not found.");
  if (old.status !== "CLOSED") throw new ApiError(400, "Only closed cases can be reused.");

  const created = await createCase(tx, {
    tenantId,
    customerId: old.customerId,
    type: old.type,
    priority: old.priority,
    subject: old.subject,
    description: old.description ?? old.subject,
    category: old.category ?? undefined,
    caseCodeId: old.caseCodeId ?? undefined,
    isTransactional: old.isTransactional,
    transactionAmount: old.transactionAmount != null ? Number(old.transactionAmount) : undefined,
    transactionCurrency: old.transactionCurrency ?? undefined,
    queueId: old.queueId ?? undefined,
    actorId,
  });

  await tx.caseNote.create({ data: { caseId: created.id, authorId: actorId, body: `Reused from ticket ${old.caseNumber}. The details were copied over.`, internal: true } });
  await tx.caseNote.create({ data: { caseId: old.id, authorId: actorId, body: `Reused as new ticket ${created.caseNumber}.`, internal: true } });
  await tx.case.update({ where: { id: old.id }, data: { reopenedCount: { increment: 1 } } });
  await logCaseActivity(tx, { tenantId, caseId: created.id, actorId, action: "reused_from", after: { fromCaseId: old.id, fromCaseNumber: old.caseNumber } });
  await logCaseActivity(tx, { tenantId, caseId: old.id, actorId, action: "reused_as", after: { newCaseId: created.id, newCaseNumber: created.caseNumber } });

  return created;
}
