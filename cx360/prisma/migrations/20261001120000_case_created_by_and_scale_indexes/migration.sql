-- Who logged each case, which department each user works in, and the indexes
-- that keep personal / team / department ticket lists fast as data grows.
-- Purely additive: two nullable columns, indexes, foreign keys. No data is removed.

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Membership" ADD COLUMN "unitId" TEXT;

-- Backfill "logged by" for existing cases from the audit trail.
UPDATE "Case" c
SET "createdById" = a."actorId"
FROM "AuditLog" a
WHERE a."entity" = 'Case'
  AND a."action" = 'created'
  AND a."entityId" = c."id"
  AND a."actorId" IS NOT NULL
  AND c."createdById" IS NULL;

-- CreateIndex
CREATE INDEX "Case_tenantId_createdAt_idx" ON "Case"("tenantId", "createdAt");
CREATE INDEX "Case_tenantId_createdById_createdAt_idx" ON "Case"("tenantId", "createdById", "createdAt");
CREATE INDEX "Case_tenantId_assignedToId_createdAt_idx" ON "Case"("tenantId", "assignedToId", "createdAt");
CREATE INDEX "Case_tenantId_escalatedUnitId_createdAt_idx" ON "Case"("tenantId", "escalatedUnitId", "createdAt");
CREATE INDEX "AuditLog_tenantId_actorId_action_createdAt_idx" ON "AuditLog"("tenantId", "actorId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
