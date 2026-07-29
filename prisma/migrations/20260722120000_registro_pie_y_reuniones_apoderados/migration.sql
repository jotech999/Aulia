-- Registro PIE y actas de reuniones de apoderados por curso.
-- Cambio aditivo y reversible: para revertir, eliminar primero las FK/índices
-- nuevos, luego las dos tablas de reuniones y finalmente las columnas agregadas
-- a FichaPie/SesionPie. No se transforma ni elimina información de dominio.

-- Reemplaza relaciones simples por relaciones tenant-scoped.
ALTER TABLE "FichaPie" DROP CONSTRAINT "FichaPie_estudianteId_fkey";
ALTER TABLE "SesionPie" DROP CONSTRAINT "SesionPie_fichaPieId_fkey";
DROP INDEX "FichaPie_colegioId_idx";
DROP INDEX "SesionPie_colegioId_idx";
DROP INDEX "SesionPie_fichaPieId_idx";

-- Las columnas de autoría se agregan primero como opcionales para poder
-- completar registros existentes sin inventar un usuario.
ALTER TABLE "FichaPie"
  ADD COLUMN "actualizadaPorId" TEXT,
  ADD COLUMN "creadaPorId" TEXT,
  ADD COLUMN "eliminadaEn" TIMESTAMP(3),
  ADD COLUMN "eliminadaPorId" TEXT;

ALTER TABLE "SesionPie"
  ADD COLUMN "actualizadaEn" TIMESTAMP(3),
  ADD COLUMN "eliminadaEn" TIMESTAMP(3),
  ADD COLUMN "eliminadaPorId" TEXT;

-- Backfill desde la evidencia append-only. Como compatibilidad con fichas
-- antiguas sin audit_log, se usa una membresía activa del mismo colegio.
UPDATE "FichaPie" AS ficha
SET "creadaPorId" = COALESCE(
      (
        SELECT audit."usuarioId"
        FROM "AuditLog" AS audit
        WHERE audit."colegioId" = ficha."colegioId"
          AND audit."entidad" = 'FichaPie'
          AND audit."entidadId" IN (ficha."id", ficha."estudianteId")
        ORDER BY audit."ts" ASC
        LIMIT 1
      ),
      (
        SELECT membresia."usuarioId"
        FROM "Membresia" AS membresia
        WHERE membresia."colegioId" = ficha."colegioId"
          AND membresia."activa" = true
        ORDER BY membresia."creadaEn" ASC
        LIMIT 1
      )
    ),
    "actualizadaPorId" = COALESCE(
      (
        SELECT audit."usuarioId"
        FROM "AuditLog" AS audit
        WHERE audit."colegioId" = ficha."colegioId"
          AND audit."entidad" = 'FichaPie'
          AND audit."entidadId" IN (ficha."id", ficha."estudianteId")
        ORDER BY audit."ts" DESC
        LIMIT 1
      ),
      (
        SELECT membresia."usuarioId"
        FROM "Membresia" AS membresia
        WHERE membresia."colegioId" = ficha."colegioId"
          AND membresia."activa" = true
        ORDER BY membresia."creadaEn" ASC
        LIMIT 1
      )
    );

UPDATE "SesionPie"
SET "actualizadaEn" = "creadaEn";

ALTER TABLE "FichaPie"
  ALTER COLUMN "creadaPorId" SET NOT NULL,
  ALTER COLUMN "actualizadaPorId" SET NOT NULL;

ALTER TABLE "SesionPie"
  ALTER COLUMN "actualizadaEn" SET NOT NULL;

CREATE TABLE "ReunionApoderados" (
  "id" TEXT NOT NULL,
  "colegioId" TEXT NOT NULL,
  "cursoId" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "horaInicio" TEXT NOT NULL,
  "horaFin" TEXT NOT NULL,
  "tema" TEXT NOT NULL,
  "objetivo" TEXT,
  "acuerdos" TEXT,
  "observaciones" TEXT,
  "creadaPorId" TEXT NOT NULL,
  "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadaPorId" TEXT NOT NULL,
  "actualizadaEn" TIMESTAMP(3) NOT NULL,
  "eliminadaEn" TIMESTAMP(3),
  "eliminadaPorId" TEXT,
  CONSTRAINT "ReunionApoderados_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReunionApoderados_horas_formato_check"
    CHECK (
      "horaInicio" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "horaFin" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    ),
  CONSTRAINT "ReunionApoderados_horas_orden_check"
    CHECK ("horaInicio" < "horaFin"),
  CONSTRAINT "ReunionApoderados_tema_check"
    CHECK (char_length(btrim("tema")) >= 3),
  CONSTRAINT "ReunionApoderados_soft_delete_check"
    CHECK (("eliminadaEn" IS NULL) = ("eliminadaPorId" IS NULL))
);

CREATE TABLE "AsistenteReunionApoderados" (
  "id" TEXT NOT NULL,
  "colegioId" TEXT NOT NULL,
  "reunionId" TEXT NOT NULL,
  "estudianteId" TEXT,
  "nombre" TEXT NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eliminadoEn" TIMESTAMP(3),
  "eliminadoPorId" TEXT,
  CONSTRAINT "AsistenteReunionApoderados_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AsistenteReunionApoderados_nombre_check"
    CHECK (char_length(btrim("nombre")) >= 2),
  CONSTRAINT "AsistenteReunionApoderados_soft_delete_check"
    CHECK (("eliminadoEn" IS NULL) = ("eliminadoPorId" IS NULL))
);

CREATE UNIQUE INDEX "Curso_colegioId_id_key"
  ON "Curso"("colegioId", "id");
CREATE UNIQUE INDEX "Estudiante_colegioId_id_key"
  ON "Estudiante"("colegioId", "id");
CREATE UNIQUE INDEX "FichaPie_colegioId_estudianteId_key"
  ON "FichaPie"("colegioId", "estudianteId");
CREATE UNIQUE INDEX "FichaPie_colegioId_id_key"
  ON "FichaPie"("colegioId", "id");
CREATE INDEX "FichaPie_colegioId_eliminadaEn_actualizadaEn_idx"
  ON "FichaPie"("colegioId", "eliminadaEn", "actualizadaEn");
CREATE INDEX "SesionPie_colegioId_fichaPieId_fecha_idx"
  ON "SesionPie"("colegioId", "fichaPieId", "fecha");
CREATE INDEX "SesionPie_colegioId_eliminadaEn_fecha_idx"
  ON "SesionPie"("colegioId", "eliminadaEn", "fecha");
CREATE UNIQUE INDEX "ReunionApoderados_colegioId_id_key"
  ON "ReunionApoderados"("colegioId", "id");
CREATE INDEX "ReunionApoderados_colegioId_cursoId_fecha_idx"
  ON "ReunionApoderados"("colegioId", "cursoId", "fecha");
CREATE INDEX "ReunionApoderados_colegioId_fecha_idx"
  ON "ReunionApoderados"("colegioId", "fecha");
CREATE INDEX "ReunionApoderados_colegioId_eliminadaEn_fecha_idx"
  ON "ReunionApoderados"("colegioId", "eliminadaEn", "fecha");
CREATE INDEX "AsistenteReunionApoderados_colegioId_reunionId_eliminadoEn_idx"
  ON "AsistenteReunionApoderados"("colegioId", "reunionId", "eliminadoEn");
CREATE INDEX "AsistenteReunionApoderados_colegioId_estudianteId_idx"
  ON "AsistenteReunionApoderados"("colegioId", "estudianteId");

ALTER TABLE "FichaPie"
  ADD CONSTRAINT "FichaPie_colegioId_estudianteId_fkey"
  FOREIGN KEY ("colegioId", "estudianteId")
  REFERENCES "Estudiante"("colegioId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FichaPie_creadaPorId_fkey"
  FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FichaPie_actualizadaPorId_fkey"
  FOREIGN KEY ("actualizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FichaPie_eliminadaPorId_fkey"
  FOREIGN KEY ("eliminadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FichaPie_soft_delete_check"
  CHECK (("eliminadaEn" IS NULL) = ("eliminadaPorId" IS NULL));

ALTER TABLE "SesionPie"
  ADD CONSTRAINT "SesionPie_colegioId_fkey"
  FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SesionPie_colegioId_fichaPieId_fkey"
  FOREIGN KEY ("colegioId", "fichaPieId")
  REFERENCES "FichaPie"("colegioId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SesionPie_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SesionPie_eliminadaPorId_fkey"
  FOREIGN KEY ("eliminadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SesionPie_soft_delete_check"
  CHECK (("eliminadaEn" IS NULL) = ("eliminadaPorId" IS NULL));

ALTER TABLE "ReunionApoderados"
  ADD CONSTRAINT "ReunionApoderados_colegioId_fkey"
  FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReunionApoderados_colegioId_cursoId_fkey"
  FOREIGN KEY ("colegioId", "cursoId")
  REFERENCES "Curso"("colegioId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReunionApoderados_creadaPorId_fkey"
  FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReunionApoderados_actualizadaPorId_fkey"
  FOREIGN KEY ("actualizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReunionApoderados_eliminadaPorId_fkey"
  FOREIGN KEY ("eliminadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AsistenteReunionApoderados"
  ADD CONSTRAINT "AsistenteReunionApoderados_colegioId_fkey"
  FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AsistenteReunionApoderados_colegioId_reunionId_fkey"
  FOREIGN KEY ("colegioId", "reunionId")
  REFERENCES "ReunionApoderados"("colegioId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AsistenteReunionApoderados_colegioId_estudianteId_fkey"
  FOREIGN KEY ("colegioId", "estudianteId")
  REFERENCES "Estudiante"("colegioId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AsistenteReunionApoderados_eliminadoPorId_fkey"
  FOREIGN KEY ("eliminadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Compatibilidad normativa: conserva la procedencia exacta cuando una
-- planificación se copia al leccionario, sin alterar clases históricas.
ALTER TABLE "ClaseRegistrada"
  ADD COLUMN "planificacionOrigenId" TEXT,
  ADD COLUMN "planificacionOrigenVersion" INTEGER,
  ADD COLUMN "planificacionSnapshotHash" TEXT,
  ADD COLUMN "planificacionCopiadaPorId" TEXT,
  ADD COLUMN "planificacionCopiadaEn" TIMESTAMP(3),
  ADD CONSTRAINT "ClaseRegistrada_planificacion_version_check"
    CHECK ("planificacionOrigenVersion" IS NULL OR "planificacionOrigenVersion" > 0);

CREATE UNIQUE INDEX "Planificacion_colegioId_id_key"
  ON "Planificacion"("colegioId", "id");
CREATE INDEX "ClaseRegistrada_colegioId_planificacionOrigenId_idx"
  ON "ClaseRegistrada"("colegioId", "planificacionOrigenId");

ALTER TABLE "ClaseRegistrada"
  ADD CONSTRAINT "ClaseRegistrada_colegioId_planificacionOrigenId_fkey"
  FOREIGN KEY ("colegioId", "planificacionOrigenId")
  REFERENCES "Planificacion"("colegioId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ClaseRegistrada_planificacionCopiadaPorId_fkey"
  FOREIGN KEY ("planificacionCopiadaPorId")
  REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una clase firmada puede recibir procedencia solo antes de la firma. Luego,
-- estos campos quedan protegidos incluso ante un UPDATE SQL accidental.
CREATE OR REPLACE FUNCTION "ciudi_proteger_procedencia_clase_firmada"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."firmadaEn" IS NOT NULL AND (
    OLD."planificacionOrigenId" IS DISTINCT FROM NEW."planificacionOrigenId"
    OR OLD."planificacionOrigenVersion" IS DISTINCT FROM NEW."planificacionOrigenVersion"
    OR OLD."planificacionSnapshotHash" IS DISTINCT FROM NEW."planificacionSnapshotHash"
    OR OLD."planificacionCopiadaPorId" IS DISTINCT FROM NEW."planificacionCopiadaPorId"
    OR OLD."planificacionCopiadaEn" IS DISTINCT FROM NEW."planificacionCopiadaEn"
  ) THEN
    RAISE EXCEPTION 'La procedencia de una clase firmada es inmutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClaseRegistrada_procedencia_firmada_inmutable"
BEFORE UPDATE OF
  "planificacionOrigenId",
  "planificacionOrigenVersion",
  "planificacionSnapshotHash",
  "planificacionCopiadaPorId",
  "planificacionCopiadaEn"
ON "ClaseRegistrada"
FOR EACH ROW EXECUTE FUNCTION "ciudi_proteger_procedencia_clase_firmada"();

-- Traza opcional del bloque cuya segunda hora alimentó asistencia diaria.
ALTER TABLE "AsistenciaDiaria"
  ADD COLUMN "fuenteBloqueId" TEXT;
CREATE UNIQUE INDEX "BloqueHorario_colegioId_id_key"
  ON "BloqueHorario"("colegioId", "id");
CREATE INDEX "AsistenciaDiaria_colegioId_fuenteBloqueId_fecha_idx"
  ON "AsistenciaDiaria"("colegioId", "fuenteBloqueId", "fecha");
ALTER TABLE "AsistenciaDiaria"
  ADD CONSTRAINT "AsistenciaDiaria_colegioId_fuenteBloqueId_fkey"
  FOREIGN KEY ("colegioId", "fuenteBloqueId")
  REFERENCES "BloqueHorario"("colegioId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vinculación opcional al apoderado real, preservando el nombre y calidad como
-- snapshot histórico para no reinterpretar actas cuando cambie el parentesco.
ALTER TABLE "Entrevista"
  ADD COLUMN "apoderadoId" TEXT,
  ADD COLUMN "calidadSnapshot" TEXT;
CREATE INDEX "Entrevista_colegioId_apoderadoId_fecha_idx"
  ON "Entrevista"("colegioId", "apoderadoId", "fecha");
ALTER TABLE "Entrevista"
  ADD CONSTRAINT "Entrevista_apoderadoId_fkey"
  FOREIGN KEY ("apoderadoId") REFERENCES "Apoderado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El timeline de convivencia es evidencia: nunca se elimina en cascada.
ALTER TABLE "SeguimientoConvivencia"
  DROP CONSTRAINT "SeguimientoConvivencia_casoId_fkey";
ALTER TABLE "SeguimientoConvivencia"
  ADD CONSTRAINT "SeguimientoConvivencia_casoId_fkey"
  FOREIGN KEY ("casoId") REFERENCES "CasoConvivencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
