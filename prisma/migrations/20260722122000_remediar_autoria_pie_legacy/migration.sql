-- Compensación para bases que alcanzaron a aplicar la primera migración PIE:
-- reemplaza cualquier autoría legacy sin evidencia en audit_log por un actor de
-- sistema inactivo y registra el antes/después. Nunca atribuye el dato a una
-- persona del colegio elegida arbitrariamente.

INSERT INTO "Usuario" (
  "id", "rut", "nombre", "email", "passwordHash", "activo", "creadoEn"
)
SELECT
  '__sistema_migracion_pie__',
  '99999999-9',
  'Sistema de migración PIE',
  'sistema-migracion-pie@educhile.invalid',
  '!cuenta-inactiva-sin-acceso!',
  false,
  CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "FichaPie" AS ficha
  WHERE NOT EXISTS (
    SELECT 1
    FROM "AuditLog" AS audit
    WHERE audit."colegioId" = ficha."colegioId"
      AND audit."entidad" = 'FichaPie'
      AND audit."entidadId" IN (ficha."id", ficha."estudianteId")
  )
)
ON CONFLICT ("id") DO NOTHING;

WITH objetivo AS (
  SELECT
    ficha."id",
    ficha."colegioId",
    ficha."creadaPorId" AS "creadaPorAnterior",
    ficha."actualizadaPorId" AS "actualizadaPorAnterior"
  FROM "FichaPie" AS ficha
  WHERE NOT EXISTS (
    SELECT 1
    FROM "AuditLog" AS audit
    WHERE audit."colegioId" = ficha."colegioId"
      AND audit."entidad" = 'FichaPie'
      AND audit."entidadId" IN (ficha."id", ficha."estudianteId")
  )
), actualizadas AS (
  UPDATE "FichaPie" AS ficha
  SET
    "creadaPorId" = '__sistema_migracion_pie__',
    "actualizadaPorId" = '__sistema_migracion_pie__'
  FROM objetivo
  WHERE ficha."id" = objetivo."id"
    AND ficha."colegioId" = objetivo."colegioId"
  RETURNING
    ficha."id",
    ficha."colegioId",
    objetivo."creadaPorAnterior",
    objetivo."actualizadaPorAnterior"
)
INSERT INTO "AuditLog" (
  "colegioId", "usuarioId", "accion", "entidad", "entidadId", "antes", "despues", "ts"
)
SELECT
  actualizadas."colegioId",
  '__sistema_migracion_pie__',
  'REMEDIAR_AUTORIA_LEGACY',
  'FichaPie',
  actualizadas."id",
  jsonb_build_object(
    'creadaPorId', actualizadas."creadaPorAnterior",
    'actualizadaPorId', actualizadas."actualizadaPorAnterior",
    'fuenteVerificable', false
  ),
  jsonb_build_object(
    'creadaPorId', '__sistema_migracion_pie__',
    'actualizadaPorId', '__sistema_migracion_pie__',
    'actor', 'SISTEMA_MIGRACION'
  ),
  CURRENT_TIMESTAMP
FROM actualizadas;
