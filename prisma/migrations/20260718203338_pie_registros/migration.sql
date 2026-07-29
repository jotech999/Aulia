-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'PIE';

-- CreateTable
CREATE TABLE "FichaPie" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "diagnosticoCifrado" TEXT NOT NULL,
    "apoyos" TEXT,
    "profesionalACargo" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FichaPie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionPie" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "fichaPieId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "asistio" BOOLEAN NOT NULL DEFAULT true,
    "observacion" TEXT,
    "autorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionPie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FichaPie_estudianteId_key" ON "FichaPie"("estudianteId");

-- CreateIndex
CREATE INDEX "FichaPie_colegioId_idx" ON "FichaPie"("colegioId");

-- CreateIndex
CREATE INDEX "SesionPie_colegioId_idx" ON "SesionPie"("colegioId");

-- CreateIndex
CREATE INDEX "SesionPie_fichaPieId_idx" ON "SesionPie"("fichaPieId");

-- AddForeignKey
ALTER TABLE "FichaPie" ADD CONSTRAINT "FichaPie_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaPie" ADD CONSTRAINT "FichaPie_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionPie" ADD CONSTRAINT "SesionPie_fichaPieId_fkey" FOREIGN KEY ("fichaPieId") REFERENCES "FichaPie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
