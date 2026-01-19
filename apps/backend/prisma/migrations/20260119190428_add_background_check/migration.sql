-- CreateEnum
CREATE TYPE "BackgroundCheckStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "SpecialistBackgroundCheck" (
    "id" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "BackgroundCheckStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialistBackgroundCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecialistBackgroundCheck_specialistId_key" ON "SpecialistBackgroundCheck"("specialistId");

-- CreateIndex
CREATE INDEX "SpecialistBackgroundCheck_status_idx" ON "SpecialistBackgroundCheck"("status");

-- AddForeignKey
ALTER TABLE "SpecialistBackgroundCheck" ADD CONSTRAINT "SpecialistBackgroundCheck_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "SpecialistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
