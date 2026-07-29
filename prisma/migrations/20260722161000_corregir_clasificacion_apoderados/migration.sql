-- La migración inicial no contaba con una fuente confiable para decidir quién
-- era titular. Se corrige conservadoramente todo vínculo existente y se elimina
-- la inferencia automática del primer registro. El colegio podrá confirmar la
-- calidad de forma explícita; el índice parcial sigue garantizando como máximo
-- un TITULAR por estudiante.
DROP TRIGGER IF EXISTS "Apoderado_primer_vinculo_titular" ON "Apoderado";
DROP FUNCTION IF EXISTS "ciudi_asignar_primer_apoderado_titular"();

ALTER TABLE "Apoderado"
  ALTER COLUMN "calidad" SET DEFAULT 'SIN_CONFIRMAR';

UPDATE "Apoderado"
SET "calidad" = 'SIN_CONFIRMAR';
