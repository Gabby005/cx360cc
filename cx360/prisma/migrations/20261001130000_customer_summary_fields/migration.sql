-- Which extra core-banking fields (BVN, date of birth, address, ...) appear on the customer summary card.
-- Purely additive: one nullable column.
ALTER TABLE "Tenant" ADD COLUMN "customerSummaryFields" JSONB;
