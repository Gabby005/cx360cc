import { Prisma, PrismaClient, CaseType, Priority } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export type CreateCaseInput = {
  tenantId: string;
  customerId: string;
  type: CaseType;
  priority: Priority;
  subject: string;
  description?: string;
  category?: string;
  queueId?: string;
};

/**
 * Creates a Case with its SLA clock stamped at creation time (resolving the
 * tenant's SlaPolicy for the given priority) and writes the corresponding
 * domain event — the single place this logic lives, so every entry point
 * that can create a case (the Cases API, and the Inbox "convert to case"
 * action) gets identical SLA + event behavior for free.
 */
export async function createCase(tx: Tx, input: CreateCaseInput) {
  const policy = await tx.slaPolicy.findUnique({
    where: { tenantId_priority: { tenantId: input.tenantId, priority: input.priority } },
  });

  const now = new Date();
  const newCase = await tx.case.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      type: input.type,
      priority: input.priority,
      subject: input.subject,
      description: input.description,
      category: input.category,
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
      payload: { caseId: newCase.id, priority: newCase.priority },
    },
  });

  return newCase;
}
