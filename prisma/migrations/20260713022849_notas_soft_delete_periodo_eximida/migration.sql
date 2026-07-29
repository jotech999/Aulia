/*
  Warnings:

  - Added the required column `actualizadaEn` to the `Calificacion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `registradoPorId` to the `Calificacion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizadaEn` to the `Evaluacion` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Evaluacion_asignaturaId_idx";

-- AlterTable
ALTER TABLE "Calificacion" ADD COLUMN     "actualizadaEn" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "eliminadaEn" TIMESTAMP(3),
ADD COLUMN     "eliminadaPorId" TEXT,
ADD COLUMN     "eximida" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registradoPorId" TEXT NOT NULL,
ALTER COLUMN "nota" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Evaluacion" ADD COLUMN     "actualizadaEn" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "eliminadaEn" TIMESTAMP(3),
ADD COLUMN     "eliminadaPorId" TEXT,
ADD COLUMN     "periodo" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Calificacion_colegioId_estudianteId_idx" ON "Calificacion"("colegioId", "estudianteId");

-- CreateIndex
CREATE INDEX "Evaluacion_asignaturaId_periodo_idx" ON "Evaluacion"("asignaturaId", "periodo");

-- Invariante normativa (Decreto 67): un eximido nunca lleva nota (no contamina el promedio).
-- Prisma no modela CHECKs; se agrega a mano.
ALTER TABLE "Calificacion"
  ADD CONSTRAINT "calificacion_eximida_sin_nota"
  CHECK (NOT "eximida" OR "nota" IS NULL);
