-- Additive only: live core banking connection settings (no customer data is stored).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "coreBankingSettings" JSONB;
