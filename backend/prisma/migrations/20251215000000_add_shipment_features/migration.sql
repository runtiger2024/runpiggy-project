-- AlterTable
ALTER TABLE "Package" ADD COLUMN "productUrl" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "loadingDate" TIMESTAMP(3),
ADD COLUMN "returnReason" TEXT;