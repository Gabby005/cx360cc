-- Additive only: delivery settings, outbound queue fields, error log, job runs.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "deliverySettings" JSONB;

ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "NotificationLog_status_nextAttemptAt_idx" ON "NotificationLog"("status", "nextAttemptAt");

CREATE TABLE IF NOT EXISTS "ErrorLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "source" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "path" TEXT,
  "userId" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "fingerprint" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ErrorLog_fingerprint_key" ON "ErrorLog"("fingerprint");
CREATE INDEX IF NOT EXISTS "ErrorLog_resolved_lastSeenAt_idx" ON "ErrorLog"("resolved", "lastSeenAt");

CREATE TABLE IF NOT EXISTS "JobRun" (
  "id" TEXT NOT NULL,
  "job" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "ok" BOOLEAN NOT NULL DEFAULT false,
  "summary" TEXT,
  "error" TEXT,
  CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");
