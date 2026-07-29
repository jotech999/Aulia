-- CreateTable
CREATE TABLE "MaterialDocente" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "tipoMaterial" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "asignatura" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadoEn" TIMESTAMP(3),

    CONSTRAINT "MaterialDocente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialDocente_colegioId_creadoEn_idx" ON "MaterialDocente"("colegioId", "creadoEn");

-- AddForeignKey
ALTER TABLE "MaterialDocente" ADD CONSTRAINT "MaterialDocente_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
