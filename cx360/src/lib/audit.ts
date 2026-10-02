import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | PrismaClient;

export type AuditInput = {
  tenantId: string;
  actorId: string | null;
  action: string; // e.g. "user_created", "role_changed", "api_key_revoked"
  entity: string; // e.g. "User", "ApiKey", "SlaPolicy"
  entityId: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Records who changed what, for the Admin → Audit log viewer.
 *
 * Best-effort on purpose: a hiccup writing the audit row must never block or
 * undo the admin change itself, so errors are logged, not thrown. Never put
 * secrets (passwords, API keys, webhook secrets) in before/after.
 */
export async function recordAudit(input: AuditInput, db: Db = prisma) {
  try {
    await db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("audit write failed", err);
  }
}
