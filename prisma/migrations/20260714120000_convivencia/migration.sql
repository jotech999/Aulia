-- CreateEnum
CREATE TYPE "EstadoCaso" AS ENUM ('ABIERTO', 'EN_SEGUIMIENTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoSeguimiento" AS ENUM ('ENTREVISTA', 'LLAMADA', 'DERIVACION', 'ACUERDO', 'NOTIFICACION_APODERADO', 'NOTA');

-- CreateTable
CREATE TABLE "CasoConvivencia" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" "EstadoCaso" NOT NULL DEFAULT 'ABIERTO',
    "responsableId" TEXT NOT NULL,
    "abiertoPorId" TEXT NOT NULL,
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoEn" TIMESTAMP(3),
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "eliminadoEn" TIMESTAMP(3),
    "eliminadoPorId" TEXT,

    CONSTRAINT "CasoConvivencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeguimientoConvivencia" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "tipo" "TipoSeguimiento" NOT NULL,
    "texto" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "autorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeguimientoConvivencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CasoConvivencia_colegioId_estado_idx" ON "CasoConvivencia"("colegioId", "estado");

-- CreateIndex
CREATE INDEX "CasoConvivencia_estudianteId_idx" ON "CasoConvivencia"("estudianteId");

-- CreateIndex
CREATE INDEX "SeguimientoConvivencia_casoId_idx" ON "SeguimientoConvivencia"("casoId");

-- AddForeignKey
ALTER TABLE "CasoConvivencia" ADD CONSTRAINT "CasoConvivencia_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeguimientoConvivencia" ADD CONSTRAINT "SeguimientoConvivencia_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "CasoConvivencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

