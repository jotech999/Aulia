-- Precondición previa a convertir la autoría histórica de FichaPie en obligatoria.
-- No inventa autores: si no existe evidencia en audit_log, la migración se
-- detiene antes de modificar el esquema y
-- entrega los identificadores mínimos necesarios para remediar el dato.
DO $$
DECLARE
  fichas_sin_autor TEXT;
BEGIN
  -- En una base que ya aplicó la migración original, la corrección posterior
  -- 20260722122000 se encarga de remediar sin bloquear el despliegue.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'FichaPie'
      AND column_name = 'creadaPorId'
  ) THEN
    RETURN;
  END IF;

  SELECT string_agg(
    format('%s (colegio %s)', ficha."id", ficha."colegioId"),
    ', ' ORDER BY ficha."colegioId", ficha."id"
  )
  INTO fichas_sin_autor
  FROM "FichaPie" AS ficha
  WHERE NOT EXISTS (
    SELECT 1
    FROM "AuditLog" AS audit
    WHERE audit."colegioId" = ficha."colegioId"
      AND audit."entidad" = 'FichaPie'
      AND audit."entidadId" IN (ficha."id", ficha."estudianteId")
  );

  IF fichas_sin_autor IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede migrar la autoría PIE sin una fuente verificable. Fichas a remediar: %',
      fichas_sin_autor;
  END IF;
END;
$$;
