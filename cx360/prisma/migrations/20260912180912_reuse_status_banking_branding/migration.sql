-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseStatus" ADD VALUE 'PENDING_BANK';
ALTER TYPE "CaseStatus" ADD VALUE 'PENDING_THIRD_PARTY';

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "reopenedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CustomerProduct" ADD COLUMN     "balance" DECIMAL(16,2),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "brandColor" TEXT NOT NULL DEFAULT '#5B5FEF',
ADD COLUMN     "logoDataUrl" TEXT;

-- CreateTable
CREATE TABLE "AccountTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerProductId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "description" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountTransaction_customerProductId_transactionDate_idx" ON "AccountTransaction"("customerProductId", "transactionDate");

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_customerProductId_fkey" FOREIGN KEY ("customerProductId") REFERENCES "CustomerProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
