-- Additive only: the team codes (Team A, Team B, ...) used to tag Inbox messages. Editable by supervisors.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "inboxTags" JSONB;
