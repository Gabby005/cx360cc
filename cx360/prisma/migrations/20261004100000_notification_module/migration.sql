-- Notification module: editable message templates, SLA escalation settings,
-- and the bookkeeping the escalation ladder needs. Purely additive: new
-- nullable columns, one new table, one index. Nothing is changed or removed.

-- Tenant: SLA escalation ladder + notification settings
ALTER TABLE "Tenant" ADD COLUMN "notificationSettings" JSONB;

-- NotificationLog: which message this was (template key), and who was copied
ALTER TABLE "NotificationLog" ADD COLUMN "kind" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN "cc" TEXT;
CREATE INDEX "NotificationLog_tenantId_relatedCaseId_idx" ON "NotificationLog"("tenantId", "relatedCaseId");

-- Case: when the SLA was first exceeded and how far up the ladder it has gone
ALTER TABLE "Case" ADD COLUMN "slaBreachedAt" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN "slaEscalationLevel" INTEGER NOT NULL DEFAULT 0;

-- Edited message templates (anything not edited uses the built-in default)
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationTemplate_tenantId_key_key" ON "NotificationTemplate"("tenantId", "key");

ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
