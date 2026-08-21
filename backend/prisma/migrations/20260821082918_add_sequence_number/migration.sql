-- AlterTable
ALTER TABLE "EmailJob" ADD COLUMN "sequenceNumber" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmailJob_batchId_sequenceNumber_key" ON "EmailJob"("batchId", "sequenceNumber");
