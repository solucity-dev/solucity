/*
  Warnings:

  - Added the required column `nombre` to the `Placeholder` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Placeholder" ADD COLUMN     "nombre" TEXT NOT NULL;
