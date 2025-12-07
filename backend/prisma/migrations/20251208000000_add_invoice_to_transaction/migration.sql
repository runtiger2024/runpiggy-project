-- AlterTable
ALTER TABLE "User" ADD COLUMN "defaultInvoiceTitle" TEXT,
ADD COLUMN "defaultTaxId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "invoiceDate" TIMESTAMP(3),
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "invoiceRandomCode" TEXT,
ADD COLUMN "invoiceStatus" TEXT;