/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,caseNumber]` on the table `Case` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `caseNumber` to the `Case` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "caseCodeId" TEXT;
ALTER TABLE "Case" ADD COLUMN     "caseNumber" TEXT;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM "Case"
)
UPDATE "Case"
SET "caseNumber" = 'LEGACY/GEN/GEN/' || LPAD(numbered.rn::text, 6, '0')
FROM numbered
WHERE "Case"."id" = numbered."id";

ALTER TABLE "Case" ALTER COLUMN "caseNumber" SET NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "caseNumberPrefix" TEXT NOT NULL DEFAULT 'CX',
ADD COLUMN     "caseSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CaseCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "CaseType" NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseCode_tenantId_type_idx" ON "CaseCode"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CaseCode_tenantId_code_key" ON "CaseCode"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Case_tenantId_caseNumber_key" ON "Case"("tenantId", "caseNumber");

-- AddForeignKey
ALTER TABLE "CaseCode" ADD CONSTRAINT "CaseCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_caseCodeId_fkey" FOREIGN KEY ("caseCodeId") REFERENCES "CaseCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
