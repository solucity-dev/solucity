/*
  Warnings:

  - You are about to drop the column `nombre` on the `Placeholder` table. All the data in the column will be lost.
  - Added the required column `name` to the `Placeholder` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Placeholder" DROP COLUMN "nombre",
ADD COLUMN     "name" TEXT NOT NULL;
