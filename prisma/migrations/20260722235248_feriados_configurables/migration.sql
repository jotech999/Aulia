-- CreateTable
CREATE TABLE "Feriado" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT,
    "fecha" DATE NOT NULL,
    "nombre" TEXT NOT NULL,
    "irrenunciable" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feriado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feriado_fecha_idx" ON "Feriado"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Feriado_colegioId_fecha_key" ON "Feriado"("colegioId", "fecha");

-- AddForeignKey
ALTER TABLE "Feriado" ADD CONSTRAINT "Feriado_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
