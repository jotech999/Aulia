-- Cierre de año escolar (Decreto 67, art. 10 y 11): resolución de promoción.
CREATE TYPE "EstadoPromocion" AS ENUM ('PROMOVIDO', 'REPITE', 'ANALISIS');

CREATE TABLE "ResolucionPromocion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "anioEscolarId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "estado" "EstadoPromocion" NOT NULL,
    "fundamento" TEXT NOT NULL,
    "estadoPropuesto" "EstadoPromocion" NOT NULL,
    "promedioGeneral" DOUBLE PRECISION,
    "asistencia" INTEGER,
    "resueltoPorId" TEXT NOT NULL,
    "resueltoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResolucionPromocion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResolucionPromocion_anioEscolarId_estudianteId_key" ON "ResolucionPromocion"("anioEscolarId", "estudianteId");
CREATE INDEX "ResolucionPromocion_colegioId_anioEscolarId_idx" ON "ResolucionPromocion"("colegioId", "anioEscolarId");

ALTER TABLE "ResolucionPromocion" ADD CONSTRAINT "ResolucionPromocion_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
