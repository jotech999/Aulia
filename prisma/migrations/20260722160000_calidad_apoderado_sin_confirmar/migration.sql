-- Permite distinguir una clasificación institucional verificada de un vínculo
-- histórico cuya calidad todavía no ha sido confirmada por el colegio.
ALTER TYPE "CalidadApoderado" ADD VALUE IF NOT EXISTS 'SIN_CONFIRMAR';
