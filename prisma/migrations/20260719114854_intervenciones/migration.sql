-- CreateEnum
CREATE TYPE "EstadoIntervencion" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateTable
CREATE TABLE "Intervencion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "responsable" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "proximoControl" DATE,
    "estado" "EstadoIntervencion" NOT NULL DEFAULT 'ABIERTA',
    "notas" TEXT,
    "autorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadaEn" TIMESTAMP(3),

    CONSTRAINT "Intervencion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Intervencion_colegioId_idx" ON "Intervencion"("colegioId");

-- CreateIndex
CREATE INDEX "Intervencion_estudianteId_idx" ON "Intervencion"("estudianteId");
