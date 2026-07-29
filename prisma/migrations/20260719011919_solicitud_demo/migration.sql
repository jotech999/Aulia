-- CreateTable
CREATE TABLE "SolicitudDemo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "colegio" TEXT,
    "telefono" TEXT,
    "cargo" TEXT,
    "mensaje" TEXT,
    "origen" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SolicitudDemo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitudDemo_creadoEn_idx" ON "SolicitudDemo"("creadoEn");
