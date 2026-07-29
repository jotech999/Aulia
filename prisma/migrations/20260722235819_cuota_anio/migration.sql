-- AlterTable
ALTER TABLE "Cuota" ADD COLUMN     "anio" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Cuota_colegioId_estudianteId_anio_idx" ON "Cuota"("colegioId", "estudianteId", "anio");
