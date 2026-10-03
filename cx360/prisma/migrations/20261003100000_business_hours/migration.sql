-- Business hours & holidays: when the bank is open, so SLA clocks set to
-- "business hours only" skip nights, weekends and public holidays.
-- Purely additive: one nullable column. Until it is filled in, every SLA clock
-- keeps running around the clock exactly as before.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "businessHours" JSONB;
