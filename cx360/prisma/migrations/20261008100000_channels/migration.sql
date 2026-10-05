-- Additive only: inbound channel support (email, SMS, WhatsApp, voice).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "channelSettings" JSONB;
ALTER TABLE "Interaction" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Interaction" ADD COLUMN IF NOT EXISTS "contact" TEXT;
ALTER TABLE "Interaction" ADD COLUMN IF NOT EXISTS "subject" TEXT;
-- A message the provider delivers twice is stored once. NULLs (manual entries) never clash.
CREATE UNIQUE INDEX IF NOT EXISTS "Interaction_tenantId_channel_externalId_key" ON "Interaction"("tenantId", "channel", "externalId");
CREATE INDEX IF NOT EXISTS "Interaction_tenantId_caseId_idx" ON "Interaction"("tenantId", "caseId");

-- Social DM channels (Instagram, Facebook Messenger).
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'MESSENGER';
