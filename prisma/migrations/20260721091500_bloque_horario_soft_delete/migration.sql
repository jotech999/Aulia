-- Conserva el historial de configuración horaria: quitar un bloque pasa a ser
-- una desactivación lógica auditada, nunca un DELETE físico.
ALTER TABLE "BloqueHorario"
ADD COLUMN "eliminadaEn" TIMESTAMP(3),
ADD COLUMN "eliminadaPorId" TEXT;
