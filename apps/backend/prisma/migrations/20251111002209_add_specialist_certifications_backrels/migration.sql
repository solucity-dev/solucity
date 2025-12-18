-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "SpecialistCertification" (
    "id" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "number" TEXT,
    "issuer" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "CertStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialistCertification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecialistCertification_specialistId_categoryId_key" ON "SpecialistCertification"("specialistId", "categoryId");

-- AddForeignKey
ALTER TABLE "SpecialistCertification" ADD CONSTRAINT "SpecialistCertification_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "SpecialistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistCertification" ADD CONSTRAINT "SpecialistCertification_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
