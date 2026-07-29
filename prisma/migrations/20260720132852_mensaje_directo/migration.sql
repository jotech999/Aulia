-- CreateTable
CREATE TABLE "MensajeDirecto" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "deApoderado" BOOLEAN NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "leidoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeDirecto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MensajeDirecto_colegioId_estudianteId_idx" ON "MensajeDirecto"("colegioId", "estudianteId");

-- CreateIndex
CREATE INDEX "MensajeDirecto_estudianteId_creadoEn_idx" ON "MensajeDirecto"("estudianteId", "creadoEn");

-- AddForeignKey
ALTER TABLE "MensajeDirecto" ADD CONSTRAINT "MensajeDirecto_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
