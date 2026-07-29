-- CreateEnum
CREATE TYPE "EstadoClasePlan" AS ENUM ('PLANIFICADA', 'REALIZADA', 'REPROGRAMADA', 'SUSPENDIDA');

-- AlterTable
ALTER TABLE "Planificacion" ADD COLUMN     "bloqueHorarioId" TEXT,
ADD COLUMN     "estadoClase" "EstadoClasePlan",
ADD COLUMN     "fechaClase" DATE,
ADD COLUMN     "ordenClase" INTEGER;

-- CreateIndex
CREATE INDEX "Planificacion_colegioId_padreId_ordenClase_idx" ON "Planificacion"("colegioId", "padreId", "ordenClase");

-- CreateIndex
CREATE INDEX "Planificacion_colegioId_asignaturaId_fechaClase_idx" ON "Planificacion"("colegioId", "asignaturaId", "fechaClase");

-- AddForeignKey
ALTER TABLE "Planificacion" ADD CONSTRAINT "Planificacion_colegioId_bloqueHorarioId_fkey" FOREIGN KEY ("colegioId", "bloqueHorarioId") REFERENCES "BloqueHorario"("colegioId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
