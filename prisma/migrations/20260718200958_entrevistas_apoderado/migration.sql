-- CreateTable
CREATE TABLE "Entrevista" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "apoderado" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "acuerdos" TEXT,
    "compromisos" TEXT,
    "fecha" DATE NOT NULL,
    "proximaCita" DATE,
    "autorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadaEn" TIMESTAMP(3),
    "eliminadaPorId" TEXT,

    CONSTRAINT "Entrevista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Entrevista_colegioId_idx" ON "Entrevista"("colegioId");

-- CreateIndex
CREATE INDEX "Entrevista_estudianteId_idx" ON "Entrevista"("estudianteId");

-- AddForeignKey
ALTER TABLE "Entrevista" ADD CONSTRAINT "Entrevista_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrevista" ADD CONSTRAINT "Entrevista_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
