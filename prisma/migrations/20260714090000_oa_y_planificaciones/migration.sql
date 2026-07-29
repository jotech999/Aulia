-- CreateEnum
CREATE TYPE "TipoPlanificacion" AS ENUM ('ANUAL', 'UNIDAD', 'CLASE');

-- CreateTable
CREATE TABLE "Oa" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "asignatura" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "eje" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "Oa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Planificacion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "asignaturaId" TEXT NOT NULL,
    "tipo" "TipoPlanificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" DATE,
    "fechaFin" DATE,
    "padreId" TEXT,
    "autorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,
    "eliminadaEn" TIMESTAMP(3),
    "eliminadaPorId" TEXT,

    CONSTRAINT "Planificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanificacionOa" (
    "planificacionId" TEXT NOT NULL,
    "oaCodigo" TEXT NOT NULL,

    CONSTRAINT "PlanificacionOa_pkey" PRIMARY KEY ("planificacionId","oaCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "Oa_codigo_key" ON "Oa"("codigo");

-- CreateIndex
CREATE INDEX "Oa_nivel_asignatura_idx" ON "Oa"("nivel", "asignatura");

-- CreateIndex
CREATE INDEX "Planificacion_colegioId_idx" ON "Planificacion"("colegioId");

-- CreateIndex
CREATE INDEX "Planificacion_asignaturaId_tipo_idx" ON "Planificacion"("asignaturaId", "tipo");

-- CreateIndex
CREATE INDEX "Planificacion_padreId_idx" ON "Planificacion"("padreId");

-- CreateIndex
CREATE INDEX "PlanificacionOa_oaCodigo_idx" ON "PlanificacionOa"("oaCodigo");

-- AddForeignKey
ALTER TABLE "Planificacion" ADD CONSTRAINT "Planificacion_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planificacion" ADD CONSTRAINT "Planificacion_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "Planificacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanificacionOa" ADD CONSTRAINT "PlanificacionOa_planificacionId_fkey" FOREIGN KEY ("planificacionId") REFERENCES "Planificacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanificacionOa" ADD CONSTRAINT "PlanificacionOa_oaCodigo_fkey" FOREIGN KEY ("oaCodigo") REFERENCES "Oa"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Índice parcial: la mayoría de las queries de cobertura filtran planificaciones vivas.
CREATE INDEX "Planificacion_asignaturaId_vivas_idx" ON "Planificacion"("asignaturaId") WHERE "eliminadaEn" IS NULL;
