-- CreateEnum
CREATE TYPE "AlcanceComunicado" AS ENUM ('COLEGIO', 'NIVEL', 'CURSO', 'ESTUDIANTE');

-- CreateTable
CREATE TABLE "Comunicado" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "alcance" "AlcanceComunicado" NOT NULL,
    "nivel" TEXT,
    "cursoId" TEXT,
    "estudianteId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadoEn" TIMESTAMP(3),
    "eliminadoPorId" TEXT,

    CONSTRAINT "Comunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComunicadoLectura" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "leidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComunicadoLectura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comunicado_colegioId_creadoEn_idx" ON "Comunicado"("colegioId", "creadoEn");

-- CreateIndex
CREATE INDEX "ComunicadoLectura_comunicadoId_idx" ON "ComunicadoLectura"("comunicadoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComunicadoLectura_comunicadoId_usuarioId_key" ON "ComunicadoLectura"("comunicadoId", "usuarioId");

-- AddForeignKey
ALTER TABLE "ComunicadoLectura" ADD CONSTRAINT "ComunicadoLectura_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

