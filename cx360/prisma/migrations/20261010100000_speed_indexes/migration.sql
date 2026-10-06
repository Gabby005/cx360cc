-- Additive only: indexes that keep screens fast as the data grows.
CREATE INDEX IF NOT EXISTS "Interaction_tenantId_direction_status_createdAt_idx" ON "Interaction"("tenantId", "direction", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Interaction_tenantId_customerId_createdAt_idx" ON "Interaction"("tenantId", "customerId", "createdAt");

-- Finding a customer by phone number (incoming calls, SMS, WhatsApp) ignores spaces/dashes and compares the last 10 digits.
-- This index makes that lookup instant instead of reading every customer.
CREATE INDEX IF NOT EXISTS "Customer_tenant_phone_key_idx" ON "Customer" ("tenantId", (right(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'), 10)));
