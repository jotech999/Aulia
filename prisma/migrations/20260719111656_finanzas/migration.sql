-- CreateEnum
CREATE TYPE "ConceptoCobro" AS ENUM ('MATRICULA', 'MENSUALIDAD', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('PENDIENTE', 'PAGADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'WEBPAY', 'KHIPU', 'TARJETA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('INICIADO', 'CONFIRMADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "PlanCobro" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "matricula" INTEGER NOT NULL,
    "arancelAnual" INTEGER NOT NULL,
    "cuotas" INTEGER NOT NULL DEFAULT 10,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cuota" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "concepto" "ConceptoCobro" NOT NULL,
    "numero" INTEGER NOT NULL DEFAULT 1,
    "monto" INTEGER NOT NULL,
    "vencimiento" DATE NOT NULL,
    "estado" "EstadoCuota" NOT NULL DEFAULT 'PENDIENTE',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "cuotaId" TEXT,
    "estudianteId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "estado" "EstadoPago" NOT NULL DEFAULT 'CONFIRMADO',
    "referencia" TEXT,
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanCobro_colegioId_idx" ON "PlanCobro"("colegioId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanCobro_colegioId_anio_key" ON "PlanCobro"("colegioId", "anio");

-- CreateIndex
CREATE INDEX "Cuota_colegioId_idx" ON "Cuota"("colegioId");

-- CreateIndex
CREATE INDEX "Cuota_estudianteId_idx" ON "Cuota"("estudianteId");

-- CreateIndex
CREATE INDEX "Pago_colegioId_idx" ON "Pago"("colegioId");

-- CreateIndex
CREATE INDEX "Pago_cuotaId_idx" ON "Pago"("cuotaId");

-- CreateIndex
CREATE INDEX "Pago_estudianteId_idx" ON "Pago"("estudianteId");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "Cuota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
