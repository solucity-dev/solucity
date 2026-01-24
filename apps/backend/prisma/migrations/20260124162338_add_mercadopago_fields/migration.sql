-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "lastPaymentStatus" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerSubId" TEXT;
