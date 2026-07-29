/*
  Warnings:

  - Added the required column `actualizadoEn` to the `AsistenciaDiaria` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AsistenciaDiaria" ADD COLUMN     "actualizadoEn" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
