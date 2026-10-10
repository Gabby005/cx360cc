-- Additive only: priority flag, colour tag and read/unread state for Inbox messages.
ALTER TABLE "Interaction" ADD COLUMN IF NOT EXISTS "flag" TEXT;
ALTER TABLE "Interaction" ADD COLUMN IF NOT EXISTS "colorTag" TEXT;
ALTER TABLE "Interaction" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

-- Messages that were already handled count as read; only brand-new inbound messages start unread.
UPDATE "Interaction" SET "readAt" = "createdAt" WHERE "readAt" IS NULL AND ("status" <> 'NEW' OR "direction" = 'outbound');
