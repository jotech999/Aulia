-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('GENERAL', 'REUNION', 'EVALUACION', 'EFEMERIDE', 'SUSPENSION');

-- CreateTable
CREATE TABLE "EventoEscolar" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "cursoId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" DATE NOT NULL,
    "tipo" "TipoEvento" NOT NULL DEFAULT 'GENERAL',
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadaEn" TIMESTAMP(3),

    CONSTRAINT "EventoEscolar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoEscolar_colegioId_fecha_idx" ON "EventoEscolar"("colegioId", "fecha");

-- AddForeignKey
ALTER TABLE "EventoEscolar" ADD CONSTRAINT "EventoEscolar_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoEscolar" ADD CONSTRAINT "EventoEscolar_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
