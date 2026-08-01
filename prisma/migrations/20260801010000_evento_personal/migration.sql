-- Nota personal del calendario: agenda privada de cada funcionario.
-- La ve solo su autor; sin datos de estudiantes.
CREATE TABLE "EventoPersonal" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "titulo" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoPersonal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventoPersonal_usuarioId_fecha_idx" ON "EventoPersonal"("usuarioId", "fecha");
CREATE INDEX "EventoPersonal_colegioId_idx" ON "EventoPersonal"("colegioId");
