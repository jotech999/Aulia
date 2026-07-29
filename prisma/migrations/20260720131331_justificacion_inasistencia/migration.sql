-- CreateTable
CREATE TABLE "JustificacionInasistencia" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalle" TEXT,
    "creadaPorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JustificacionInasistencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JustificacionInasistencia_colegioId_estudianteId_idx" ON "JustificacionInasistencia"("colegioId", "estudianteId");

-- CreateIndex
CREATE INDEX "JustificacionInasistencia_estudianteId_fecha_idx" ON "JustificacionInasistencia"("estudianteId", "fecha");

-- AddForeignKey
ALTER TABLE "JustificacionInasistencia" ADD CONSTRAINT "JustificacionInasistencia_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
