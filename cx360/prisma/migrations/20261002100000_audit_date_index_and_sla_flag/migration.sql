-- Remembers which SLA warning/breach event was last sent for a case, so the
-- scheduled SLA sweep emits each one once instead of on every run.
-- Plus an index that keeps the Audit log viewer fast as the log grows.
-- Purely additive: one nullable column and one index. No data is changed.

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "slaLastFlag" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
