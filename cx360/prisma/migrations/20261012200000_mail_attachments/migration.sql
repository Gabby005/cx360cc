CREATE TABLE IF NOT EXISTS "MailAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "notificationId" TEXT,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MailAttachment_notificationId_idx" ON "MailAttachment"("notificationId");
CREATE INDEX IF NOT EXISTS "MailAttachment_tenantId_createdAt_idx" ON "MailAttachment"("tenantId", "createdAt");
