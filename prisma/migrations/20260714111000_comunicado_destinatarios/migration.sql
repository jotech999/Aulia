-- DropForeignKey
ALTER TABLE "ComunicadoLectura" DROP CONSTRAINT "ComunicadoLectura_comunicadoId_fkey";

-- DropTable
DROP TABLE "ComunicadoLectura";

-- CreateTable
CREATE TABLE "ComunicadoDestinatario" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "apoderadoUsuarioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "leidoEn" TIMESTAMP(3),

    CONSTRAINT "ComunicadoDestinatario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComunicadoDestinatario_comunicadoId_idx" ON "ComunicadoDestinatario"("comunicadoId");

-- CreateIndex
CREATE INDEX "ComunicadoDestinatario_apoderadoUsuarioId_colegioId_idx" ON "ComunicadoDestinatario"("apoderadoUsuarioId", "colegioId");

-- CreateIndex
CREATE UNIQUE INDEX "ComunicadoDestinatario_comunicadoId_apoderadoUsuarioId_estu_key" ON "ComunicadoDestinatario"("comunicadoId", "apoderadoUsuarioId", "estudianteId");

-- AddForeignKey
ALTER TABLE "ComunicadoDestinatario" ADD CONSTRAINT "ComunicadoDestinatario_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

