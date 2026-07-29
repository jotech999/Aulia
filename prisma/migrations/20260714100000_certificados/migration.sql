-- CreateEnum
CREATE TYPE "TipoCertificado" AS ENUM ('ALUMNO_REGULAR', 'NOTAS_PARCIALES');

-- AlterTable
ALTER TABLE "Colegio" ADD COLUMN     "comuna" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "directorCargo" TEXT,
ADD COLUMN     "directorNombre" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "Certificado" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "tipo" "TipoCertificado" NOT NULL,
    "folio" INTEGER NOT NULL,
    "tokenVerificacion" TEXT NOT NULL,
    "hashContenido" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "anio" INTEGER NOT NULL,
    "periodo" INTEGER,
    "emitidoPorId" TEXT NOT NULL,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenciaHasta" TIMESTAMP(3),
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "Certificado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificado_tokenVerificacion_key" ON "Certificado"("tokenVerificacion");

-- CreateIndex
CREATE INDEX "Certificado_colegioId_idx" ON "Certificado"("colegioId");

-- CreateIndex
CREATE INDEX "Certificado_estudianteId_idx" ON "Certificado"("estudianteId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificado_colegioId_folio_key" ON "Certificado"("colegioId", "folio");

-- AddForeignKey
ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

