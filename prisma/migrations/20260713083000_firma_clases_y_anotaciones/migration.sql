-- AlterTable
ALTER TABLE "Anotacion" ADD COLUMN     "actualizadaEn" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "eliminadaEn" TIMESTAMP(3),
ADD COLUMN     "eliminadaPorId" TEXT,
ADD COLUMN     "fechaHecho" DATE;

-- AlterTable
ALTER TABLE "ClaseRegistrada" ADD COLUMN     "actualizadaEn" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "bloqueHorarioId" TEXT,
ADD COLUMN     "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "eliminadaEn" TIMESTAMP(3),
ADD COLUMN     "eliminadaPorId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClaseRegistrada_asignaturaId_fecha_bloqueHorarioId_key" ON "ClaseRegistrada"("asignaturaId", "fecha", "bloqueHorarioId");

-- AddForeignKey
ALTER TABLE "ClaseRegistrada" ADD CONSTRAINT "ClaseRegistrada_bloqueHorarioId_fkey" FOREIGN KEY ("bloqueHorarioId") REFERENCES "BloqueHorario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

