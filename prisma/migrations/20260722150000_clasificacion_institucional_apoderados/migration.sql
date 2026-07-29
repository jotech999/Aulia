-- Clasificación institucional de apoderados y vínculo histórico en actas.
-- Reversible: quitar primero la FK/índices/trigger, luego apoderadoId y calidad,
-- y finalmente el enum. El backfill no elimina ni reescribe PII.

CREATE TYPE "CalidadApoderado" AS ENUM ('TITULAR', 'SUPLENTE');

ALTER TABLE "Apoderado"
  ADD COLUMN "calidad" "CalidadApoderado" NOT NULL DEFAULT 'SUPLENTE';

-- Backfill determinístico: un titular por estudiante (menor id estable) y los
-- restantes vínculos como suplentes. También funciona si la tabla está vacía.
WITH clasificacion AS (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "estudianteId" ORDER BY "id") AS orden
  FROM "Apoderado"
)
UPDATE "Apoderado" AS apoderado
SET "calidad" = CASE
  WHEN clasificacion.orden = 1 THEN 'TITULAR'::"CalidadApoderado"
  ELSE 'SUPLENTE'::"CalidadApoderado"
END
FROM clasificacion
WHERE clasificacion."id" = apoderado."id";

CREATE INDEX "Apoderado_estudianteId_calidad_idx"
  ON "Apoderado"("estudianteId", "calidad");

-- PostgreSQL garantiza como máximo un titular institucional por estudiante.
-- Prisma no representa índices parciales, por eso vive explícitamente aquí.
CREATE UNIQUE INDEX "Apoderado_un_titular_por_estudiante_key"
  ON "Apoderado"("estudianteId")
  WHERE "calidad" = 'TITULAR';

-- Necesario para la FK compuesta que asegura que el asistente vinculado sea
-- realmente apoderado del estudiante consignado en la misma fila del acta.
CREATE UNIQUE INDEX "Apoderado_id_estudianteId_key"
  ON "Apoderado"("id", "estudianteId");

-- Mantiene compatibilidad con las acciones actuales: si se crea el primer
-- apoderado de un estudiante sin indicar calidad, se convierte en TITULAR; los
-- siguientes conservan el default SUPLENTE. El índice parcial resuelve carreras.
CREATE OR REPLACE FUNCTION "ciudi_asignar_primer_apoderado_titular"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."calidad" = 'SUPLENTE'
     AND NOT EXISTS (
       SELECT 1
       FROM "Apoderado"
       WHERE "estudianteId" = NEW."estudianteId"
     ) THEN
    NEW."calidad" := 'TITULAR';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Apoderado_primer_vinculo_titular"
BEFORE INSERT ON "Apoderado"
FOR EACH ROW EXECUTE FUNCTION "ciudi_asignar_primer_apoderado_titular"();

ALTER TABLE "AsistenteReunionApoderados"
  ADD COLUMN "apoderadoId" TEXT,
  ADD CONSTRAINT "AsistenteReunionApoderados_apoderado_requiere_estudiante_check"
    CHECK ("apoderadoId" IS NULL OR "estudianteId" IS NOT NULL);

CREATE INDEX "AsistenteReunionApoderados_colegioId_apoderadoId_idx"
  ON "AsistenteReunionApoderados"("colegioId", "apoderadoId");

ALTER TABLE "AsistenteReunionApoderados"
  ADD CONSTRAINT "AsistenteReunionApoderados_apoderadoId_estudianteId_fkey"
  FOREIGN KEY ("apoderadoId", "estudianteId")
  REFERENCES "Apoderado"("id", "estudianteId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
