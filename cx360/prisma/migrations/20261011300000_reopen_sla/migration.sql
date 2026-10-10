-- Additive only: when a ticket was last reopened. The SLA clock restarts from this moment.
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3);
