-- CreateEnum
CREATE TYPE "EstadoPostulacion" AS ENUM ('RECIBIDA', 'EN_REVISION', 'ACEPTADA', 'RECHAZADA', 'MATRICULADA');

-- CreateTable
CREATE TABLE "Postulacion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "fechaNacimiento" DATE,
    "nivelSolicitado" TEXT NOT NULL,
    "apoderadoNombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "comentario" TEXT,
    "estado" "EstadoPostulacion" NOT NULL DEFAULT 'RECIBIDA',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Postulacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Postulacion_colegioId_estado_creadaEn_idx" ON "Postulacion"("colegioId", "estado", "creadaEn");

-- AddForeignKey
ALTER TABLE "Postulacion" ADD CONSTRAINT "Postulacion_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
