-- CreateEnum
CREATE TYPE "EstadoJustificacion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoComunicado" AS ENUM ('BORRADOR', 'PROGRAMADO', 'PUBLICANDO', 'PUBLICADO', 'CANCELADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "EstadoHorarioVersion" AS ENUM ('BORRADOR', 'PUBLICADO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "EstadoOperacionIdempotente" AS ENUM ('PROCESANDO', 'APLICADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoOnboarding" AS ENUM ('NO_INICIADO', 'EN_PROGRESO', 'COMPLETADO');

-- CreateEnum
CREATE TYPE "PasoOnboarding" AS ENUM ('DATOS_COLEGIO', 'ANIO_ESCOLAR', 'CURSOS', 'EQUIPO', 'ESTUDIANTES', 'HORARIO', 'FINAL');

-- CreateEnum
CREATE TYPE "TipoSolicitudTitular" AS ENUM ('ACCESO', 'RECTIFICACION', 'SUPRESION', 'OPOSICION', 'PORTABILIDAD', 'BLOQUEO');

-- CreateEnum
CREATE TYPE "EstadoSolicitudTitular" AS ENUM ('RECIBIDA', 'VERIFICANDO_IDENTIDAD', 'EN_PROCESO', 'RESPONDIDA', 'RECHAZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoExportacionEde" AS ENUM ('BORRADOR', 'GENERANDO', 'CON_ERRORES', 'LISTA_PARA_VALIDAR', 'VALIDADA', 'EXPORTADA');

-- CreateEnum
CREATE TYPE "EstadoTrabajoOutbox" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "TipoRubrica" AS ENUM ('RUBRICA', 'PAUTA_COTEJO');

-- CreateEnum
CREATE TYPE "EstadoRubrica" AS ENUM ('BORRADOR', 'PUBLICADA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "EstadoAplicacionRubrica" AS ENUM ('BORRADOR', 'FINALIZADA', 'ANULADA');

-- AlterEnum
ALTER TYPE "AlcanceComunicado" ADD VALUE 'SELECCION';

-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'ESTUDIANTE';

-- DropIndex
DROP INDEX "BloqueHorario_asignaturaId_idx";

-- AlterTable
ALTER TABLE "BloqueHorario" ADD COLUMN     "colegioId" TEXT,
ADD COLUMN     "horaFinMin" INTEGER,
ADD COLUMN     "horaInicioMin" INTEGER,
ADD COLUMN     "horarioVersionId" TEXT;

-- Backfill tenant y minutos antes de exigir NOT NULL.
UPDATE "BloqueHorario" b
SET "colegioId" = a."colegioId",
    "horaInicioMin" = split_part(b."horaInicio", ':', 1)::int * 60 + split_part(b."horaInicio", ':', 2)::int,
    "horaFinMin" = split_part(b."horaFin", ':', 1)::int * 60 + split_part(b."horaFin", ':', 2)::int
FROM "Asignatura" a
WHERE a."id" = b."asignaturaId";

-- AlterTable
ALTER TABLE "ClaseRegistrada" ADD COLUMN     "firmaProveedor" TEXT,
ADD COLUMN     "firmaSnapshotHash" TEXT,
ADD COLUMN     "firmaTransaccionId" TEXT,
ADD COLUMN     "firmaVerificadaEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Comunicado" ADD COLUMN     "canceladoEn" TIMESTAMP(3),
ADD COLUMN     "canceladoPorId" TEXT,
ADD COLUMN     "esPlantilla" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estado" "EstadoComunicado" NOT NULL DEFAULT 'PUBLICADO',
ADD COLUMN     "nombrePlantilla" TEXT,
ADD COLUMN     "programadoPara" TIMESTAMP(3),
ADD COLUMN     "publicadoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Evaluacion" ADD COLUMN     "rubricaId" TEXT;

-- AlterTable
ALTER TABLE "JustificacionInasistencia" ADD COLUMN     "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "anuladaEn" TIMESTAMP(3),
ADD COLUMN     "anuladaPorId" TEXT,
ADD COLUMN     "asistenciaDiariaId" TEXT,
ADD COLUMN     "estado" "EstadoJustificacion" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "fundamentoRevision" TEXT,
ADD COLUMN     "revisadaEn" TIMESTAMP(3),
ADD COLUMN     "revisadaPorId" TEXT;

-- AlterTable
ALTER TABLE "Membresia" ADD COLUMN     "activa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "revocadaEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Planificacion" ADD COLUMN     "esPlantilla" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origenId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "EventoJustificacion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "justificacionId" TEXT NOT NULL,
    "estadoAnterior" "EstadoJustificacion",
    "estadoNuevo" "EstadoJustificacion" NOT NULL,
    "actorId" TEXT NOT NULL,
    "fundamento" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoJustificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioCurso" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,

    CONSTRAINT "HorarioCurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioVersion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "horarioCursoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoHorarioVersion" NOT NULL DEFAULT 'BORRADOR',
    "vigenteDesde" DATE NOT NULL,
    "vigenteHasta" DATE,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadoPorId" TEXT,
    "publicadoEn" TIMESTAMP(3),

    CONSTRAINT "HorarioVersion_pkey" PRIMARY KEY ("id")
);

-- Crea una versión histórica inicial por curso que ya tiene bloques.
INSERT INTO "HorarioCurso" ("id", "colegioId", "cursoId")
SELECT 'hc_' || md5(c."id"), c."colegioId", c."id"
FROM "Curso" c
WHERE EXISTS (
  SELECT 1
  FROM "Asignatura" a
  JOIN "BloqueHorario" b ON b."asignaturaId" = a."id"
  WHERE a."cursoId" = c."id"
);

INSERT INTO "HorarioVersion" (
  "id", "colegioId", "horarioCursoId", "numero", "estado",
  "vigenteDesde", "creadoPorId", "creadoEn", "publicadoPorId", "publicadoEn"
)
SELECT
  'hv_' || md5(h."cursoId" || ':1'), h."colegioId", h."id", 1,
  'PUBLICADO'::"EstadoHorarioVersion", DATE '2000-01-01',
  'migracion_sistema', CURRENT_TIMESTAMP, 'migracion_sistema', CURRENT_TIMESTAMP
FROM "HorarioCurso" h;

UPDATE "BloqueHorario" b
SET "horarioVersionId" = hv."id"
FROM "Asignatura" a
JOIN "HorarioCurso" hc
  ON hc."cursoId" = a."cursoId" AND hc."colegioId" = a."colegioId"
JOIN "HorarioVersion" hv
  ON hv."horarioCursoId" = hc."id" AND hv."numero" = 1
WHERE a."id" = b."asignaturaId";

ALTER TABLE "BloqueHorario"
  ALTER COLUMN "colegioId" SET NOT NULL,
  ALTER COLUMN "horaInicioMin" SET NOT NULL,
  ALTER COLUMN "horaFinMin" SET NOT NULL;

ALTER TABLE "BloqueHorario"
  ADD CONSTRAINT "BloqueHorario_dia_check" CHECK ("dia" BETWEEN 1 AND 5),
  ADD CONSTRAINT "BloqueHorario_horas_check" CHECK (
    "horaInicioMin" >= 0 AND "horaFinMin" <= 1440 AND "horaInicioMin" < "horaFinMin"
  );

-- CreateTable
CREATE TABLE "AsistenciaBloque" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "bloqueHorarioId" TEXT NOT NULL,
    "claseRegistradaId" TEXT,
    "fecha" DATE NOT NULL,
    "estado" "EstadoAsistencia" NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "clientMutationId" TEXT,
    "capturadaEn" TIMESTAMP(3),
    "recibidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsistenciaBloque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanificacionHistorial" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "planificacionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" DATE,
    "fechaFin" DATE,
    "oaCodigos" JSONB NOT NULL,
    "guardadaPorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanificacionHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComunicadoObjetivoEstudiante" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,

    CONSTRAINT "ComunicadoObjetivoEstudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubrica" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "asignaturaId" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "TipoRubrica" NOT NULL DEFAULT 'RUBRICA',
    "estado" "EstadoRubrica" NOT NULL DEFAULT 'BORRADOR',
    "grupoVersionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "autorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,
    "publicadaEn" TIMESTAMP(3),
    "publicadaPorId" TEXT,
    "eliminadaEn" TIMESTAMP(3),
    "eliminadaPorId" TEXT,

    CONSTRAINT "Rubrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterioRubrica" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "descripcion" TEXT NOT NULL,
    "peso" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "puntajeMax" DECIMAL(8,2) NOT NULL DEFAULT 0,

    CONSTRAINT "CriterioRubrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NivelCriterio" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "criterioId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "etiqueta" TEXT NOT NULL,
    "descriptor" TEXT NOT NULL,
    "puntaje" DECIMAL(8,2) NOT NULL DEFAULT 0,

    CONSTRAINT "NivelCriterio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricaOa" (
    "colegioId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "oaCodigo" TEXT NOT NULL,

    CONSTRAINT "RubricaOa_pkey" PRIMARY KEY ("colegioId","rubricaId","oaCodigo")
);

-- CreateTable
CREATE TABLE "AplicacionRubrica" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "evaluacionId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "estado" "EstadoAplicacionRubrica" NOT NULL DEFAULT 'BORRADOR',
    "puntajeTotal" DECIMAL(10,2),
    "retroalimentacion" TEXT,
    "evaluadorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,
    "finalizadaEn" TIMESTAMP(3),
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,

    CONSTRAINT "AplicacionRubrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntajeCriterioRubrica" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "aplicacionId" TEXT NOT NULL,
    "criterioId" TEXT NOT NULL,
    "nivelId" TEXT,
    "puntaje" DECIMAL(8,2) NOT NULL,
    "comentario" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PuntajeCriterioRubrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperacionIdempotente" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "membresiaId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "estado" "EstadoOperacionIdempotente" NOT NULL DEFAULT 'PROCESANDO',
    "resultadoMinimo" JSONB,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadaEn" TIMESTAMP(3),
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperacionIdempotente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingColegio" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "versionFlujo" INTEGER NOT NULL DEFAULT 1,
    "estado" "EstadoOnboarding" NOT NULL DEFAULT 'NO_INICIADO',
    "pasoActual" "PasoOnboarding" NOT NULL DEFAULT 'DATOS_COLEGIO',
    "iniciadoPorId" TEXT,
    "iniciadoEn" TIMESTAMP(3),
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "completadoEn" TIMESTAMP(3),

    CONSTRAINT "OnboardingColegio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudTitular" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "titularUsuarioId" TEXT NOT NULL,
    "estudianteId" TEXT,
    "representanteUsuarioId" TEXT,
    "tipo" "TipoSolicitudTitular" NOT NULL,
    "estado" "EstadoSolicitudTitular" NOT NULL DEFAULT 'RECIBIDA',
    "canal" TEXT NOT NULL DEFAULT 'PORTAL',
    "descripcion" TEXT,
    "recibidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vencimientoEn" TIMESTAMP(3) NOT NULL,
    "responsableId" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "codigoMotivo" TEXT,
    "respuesta" TEXT,
    "alcance" JSONB,

    CONSTRAINT "SolicitudTitular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoSolicitudTitular" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "estadoAnterior" "EstadoSolicitudTitular",
    "estadoNuevo" "EstadoSolicitudTitular" NOT NULL,
    "actorId" TEXT NOT NULL,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoSolicitudTitular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportacionEde" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "anioEscolarId" TEXT NOT NULL,
    "solicitadoPorId" TEXT NOT NULL,
    "estado" "EstadoExportacionEde" NOT NULL DEFAULT 'BORRADOR',
    "versionEde" TEXT,
    "versionCeds" TEXT,
    "versionMapeo" TEXT,
    "containerVersion" TEXT,
    "imageDigest" TEXT,
    "generadoEn" TIMESTAMP(3),
    "validadoEn" TIMESTAMP(3),
    "exportadoEn" TIMESTAMP(3),
    "hashSha256" TEXT,
    "tamanoBytes" BIGINT,
    "conteos" JSONB,
    "errores" JSONB,
    "keyId" TEXT,
    "cifrado" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportacionEde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtefactoExportacionEde" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "exportacionId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "tamanoBytes" BIGINT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtefactoExportacionEde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoEstudiante" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadoEn" TIMESTAMP(3),

    CONSTRAINT "AccesoEstudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrabajoOutbox" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "agregadoId" TEXT NOT NULL,
    "payloadMinimo" JSONB,
    "estado" "EstadoTrabajoOutbox" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "disponibleEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueadoEn" TIMESTAMP(3),
    "procesadoEn" TIMESTAMP(3),
    "errorCodigo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrabajoOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificacionSistema" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "ejecutadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detalle" JSONB,
    "ejecutadaPorId" TEXT,

    CONSTRAINT "VerificacionSistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LimiteAutenticacion" (
    "claveHash" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ventanaIniciaEn" TIMESTAMP(3) NOT NULL,
    "bloqueadoHasta" TIMESTAMP(3),
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LimiteAutenticacion_pkey" PRIMARY KEY ("claveHash")
);

-- Backfills compatibles con registros existentes.
UPDATE "Comunicado"
SET "publicadoEn" = "creadoEn"
WHERE "estado" = 'PUBLICADO';

UPDATE "JustificacionInasistencia" j
SET "asistenciaDiariaId" = a."id"
FROM "AsistenciaDiaria" a
WHERE a."colegioId" = j."colegioId"
  AND a."estudianteId" = j."estudianteId"
  AND a."fecha" = j."fecha"
  AND a."estado" = 'AUSENTE'
  AND j."asistenciaDiariaId" IS NULL;

ALTER TABLE "JustificacionInasistencia"
  ADD CONSTRAINT "JustificacionInasistencia_revision_check" CHECK (
    ("estado" = 'PENDIENTE' AND "revisadaPorId" IS NULL AND "revisadaEn" IS NULL)
    OR ("estado" IN ('APROBADA', 'RECHAZADA') AND "revisadaPorId" IS NOT NULL AND "revisadaEn" IS NOT NULL)
    OR ("estado" = 'ANULADA' AND "anuladaPorId" IS NOT NULL AND "anuladaEn" IS NOT NULL)
  );

ALTER TABLE "JustificacionInasistencia"
  ALTER COLUMN "actualizadaEn" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "EventoJustificacion_colegioId_justificacionId_creadoEn_idx" ON "EventoJustificacion"("colegioId", "justificacionId", "creadoEn");

-- CreateIndex
CREATE INDEX "EventoJustificacion_colegioId_estadoNuevo_creadoEn_idx" ON "EventoJustificacion"("colegioId", "estadoNuevo", "creadoEn");

-- CreateIndex
CREATE INDEX "HorarioCurso_colegioId_idx" ON "HorarioCurso"("colegioId");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioCurso_colegioId_cursoId_key" ON "HorarioCurso"("colegioId", "cursoId");

-- CreateIndex
CREATE INDEX "HorarioVersion_colegioId_estado_vigenteDesde_idx" ON "HorarioVersion"("colegioId", "estado", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioVersion_colegioId_horarioCursoId_numero_key" ON "HorarioVersion"("colegioId", "horarioCursoId", "numero");

-- CreateIndex
CREATE INDEX "AsistenciaBloque_colegioId_fecha_bloqueHorarioId_idx" ON "AsistenciaBloque"("colegioId", "fecha", "bloqueHorarioId");

-- CreateIndex
CREATE INDEX "AsistenciaBloque_colegioId_estudianteId_fecha_idx" ON "AsistenciaBloque"("colegioId", "estudianteId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaBloque_colegioId_estudianteId_bloqueHorarioId_fec_key" ON "AsistenciaBloque"("colegioId", "estudianteId", "bloqueHorarioId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaBloque_colegioId_clientMutationId_key" ON "AsistenciaBloque"("colegioId", "clientMutationId");

-- CreateIndex
CREATE INDEX "PlanificacionHistorial_colegioId_planificacionId_creadaEn_idx" ON "PlanificacionHistorial"("colegioId", "planificacionId", "creadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "PlanificacionHistorial_colegioId_planificacionId_version_key" ON "PlanificacionHistorial"("colegioId", "planificacionId", "version");

-- CreateIndex
CREATE INDEX "ComunicadoObjetivoEstudiante_colegioId_estudianteId_idx" ON "ComunicadoObjetivoEstudiante"("colegioId", "estudianteId");

-- CreateIndex
CREATE UNIQUE INDEX "ComunicadoObjetivoEstudiante_colegioId_comunicadoId_estudia_key" ON "ComunicadoObjetivoEstudiante"("colegioId", "comunicadoId", "estudianteId");

-- CreateIndex
CREATE INDEX "Rubrica_colegioId_idx" ON "Rubrica"("colegioId");

-- CreateIndex
CREATE INDEX "Rubrica_asignaturaId_idx" ON "Rubrica"("asignaturaId");

-- CreateIndex
CREATE UNIQUE INDEX "Rubrica_colegioId_grupoVersionId_version_key" ON "Rubrica"("colegioId", "grupoVersionId", "version");

-- CreateIndex
CREATE INDEX "CriterioRubrica_colegioId_rubricaId_idx" ON "CriterioRubrica"("colegioId", "rubricaId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterioRubrica_colegioId_rubricaId_orden_key" ON "CriterioRubrica"("colegioId", "rubricaId", "orden");

-- CreateIndex
CREATE INDEX "NivelCriterio_colegioId_criterioId_idx" ON "NivelCriterio"("colegioId", "criterioId");

-- CreateIndex
CREATE UNIQUE INDEX "NivelCriterio_colegioId_criterioId_orden_key" ON "NivelCriterio"("colegioId", "criterioId", "orden");

-- CreateIndex
CREATE INDEX "RubricaOa_oaCodigo_idx" ON "RubricaOa"("oaCodigo");

-- CreateIndex
CREATE INDEX "AplicacionRubrica_colegioId_rubricaId_estado_idx" ON "AplicacionRubrica"("colegioId", "rubricaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "AplicacionRubrica_colegioId_evaluacionId_estudianteId_key" ON "AplicacionRubrica"("colegioId", "evaluacionId", "estudianteId");

-- CreateIndex
CREATE INDEX "PuntajeCriterioRubrica_colegioId_criterioId_idx" ON "PuntajeCriterioRubrica"("colegioId", "criterioId");

-- CreateIndex
CREATE UNIQUE INDEX "PuntajeCriterioRubrica_colegioId_aplicacionId_criterioId_key" ON "PuntajeCriterioRubrica"("colegioId", "aplicacionId", "criterioId");

-- CreateIndex
CREATE INDEX "OperacionIdempotente_colegioId_estado_creadaEn_idx" ON "OperacionIdempotente"("colegioId", "estado", "creadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionIdempotente_colegioId_membresiaId_clave_key" ON "OperacionIdempotente"("colegioId", "membresiaId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingColegio_colegioId_key" ON "OnboardingColegio"("colegioId");

-- CreateIndex
CREATE INDEX "OnboardingColegio_colegioId_estado_idx" ON "OnboardingColegio"("colegioId", "estado");

-- CreateIndex
CREATE INDEX "SolicitudTitular_colegioId_estado_vencimientoEn_idx" ON "SolicitudTitular"("colegioId", "estado", "vencimientoEn");

-- CreateIndex
CREATE INDEX "SolicitudTitular_colegioId_titularUsuarioId_recibidaEn_idx" ON "SolicitudTitular"("colegioId", "titularUsuarioId", "recibidaEn");

-- CreateIndex
CREATE INDEX "EventoSolicitudTitular_colegioId_solicitudId_creadoEn_idx" ON "EventoSolicitudTitular"("colegioId", "solicitudId", "creadoEn");

-- CreateIndex
CREATE INDEX "ExportacionEde_colegioId_estado_creadaEn_idx" ON "ExportacionEde"("colegioId", "estado", "creadaEn");

-- CreateIndex
CREATE INDEX "ExportacionEde_colegioId_anioEscolarId_versionEde_idx" ON "ExportacionEde"("colegioId", "anioEscolarId", "versionEde");

-- CreateIndex
CREATE INDEX "ArtefactoExportacionEde_colegioId_exportacionId_idx" ON "ArtefactoExportacionEde"("colegioId", "exportacionId");

-- CreateIndex
CREATE INDEX "AccesoEstudiante_colegioId_activo_idx" ON "AccesoEstudiante"("colegioId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "AccesoEstudiante_colegioId_usuarioId_key" ON "AccesoEstudiante"("colegioId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "AccesoEstudiante_colegioId_estudianteId_key" ON "AccesoEstudiante"("colegioId", "estudianteId");

-- CreateIndex
CREATE INDEX "TrabajoOutbox_colegioId_estado_disponibleEn_idx" ON "TrabajoOutbox"("colegioId", "estado", "disponibleEn");

-- CreateIndex
CREATE UNIQUE INDEX "TrabajoOutbox_colegioId_claveIdempotencia_key" ON "TrabajoOutbox"("colegioId", "claveIdempotencia");

-- CreateIndex
CREATE INDEX "VerificacionSistema_colegioId_tipo_ejecutadaEn_idx" ON "VerificacionSistema"("colegioId", "tipo", "ejecutadaEn");

-- CreateIndex
CREATE INDEX "LimiteAutenticacion_bloqueadoHasta_idx" ON "LimiteAutenticacion"("bloqueadoHasta");

-- CreateIndex
CREATE INDEX "BloqueHorario_colegioId_asignaturaId_idx" ON "BloqueHorario"("colegioId", "asignaturaId");

-- CreateIndex
CREATE INDEX "BloqueHorario_colegioId_horarioVersionId_dia_horaInicioMin_idx" ON "BloqueHorario"("colegioId", "horarioVersionId", "dia", "horaInicioMin");

-- CreateIndex
CREATE INDEX "Comunicado_colegioId_estado_programadoPara_idx" ON "Comunicado"("colegioId", "estado", "programadoPara");

-- CreateIndex
CREATE INDEX "Evaluacion_colegioId_rubricaId_idx" ON "Evaluacion"("colegioId", "rubricaId");

-- CreateIndex
CREATE UNIQUE INDEX "JustificacionInasistencia_asistenciaDiariaId_key" ON "JustificacionInasistencia"("asistenciaDiariaId");

-- CreateIndex
CREATE INDEX "JustificacionInasistencia_colegioId_estado_fecha_idx" ON "JustificacionInasistencia"("colegioId", "estado", "fecha");

-- CreateIndex
CREATE INDEX "Membresia_usuarioId_activa_idx" ON "Membresia"("usuarioId", "activa");

-- CreateIndex
CREATE INDEX "Membresia_colegioId_rol_activa_idx" ON "Membresia"("colegioId", "rol", "activa");

-- CreateIndex
CREATE INDEX "Planificacion_colegioId_esPlantilla_actualizadaEn_idx" ON "Planificacion"("colegioId", "esPlantilla", "actualizadaEn");

-- AddForeignKey
ALTER TABLE "JustificacionInasistencia" ADD CONSTRAINT "JustificacionInasistencia_asistenciaDiariaId_fkey" FOREIGN KEY ("asistenciaDiariaId") REFERENCES "AsistenciaDiaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoJustificacion" ADD CONSTRAINT "EventoJustificacion_justificacionId_fkey" FOREIGN KEY ("justificacionId") REFERENCES "JustificacionInasistencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueHorario" ADD CONSTRAINT "BloqueHorario_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueHorario" ADD CONSTRAINT "BloqueHorario_horarioVersionId_fkey" FOREIGN KEY ("horarioVersionId") REFERENCES "HorarioVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioCurso" ADD CONSTRAINT "HorarioCurso_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioCurso" ADD CONSTRAINT "HorarioCurso_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioVersion" ADD CONSTRAINT "HorarioVersion_horarioCursoId_fkey" FOREIGN KEY ("horarioCursoId") REFERENCES "HorarioCurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaBloque" ADD CONSTRAINT "AsistenciaBloque_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaBloque" ADD CONSTRAINT "AsistenciaBloque_bloqueHorarioId_fkey" FOREIGN KEY ("bloqueHorarioId") REFERENCES "BloqueHorario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planificacion" ADD CONSTRAINT "Planificacion_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Planificacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanificacionHistorial" ADD CONSTRAINT "PlanificacionHistorial_planificacionId_fkey" FOREIGN KEY ("planificacionId") REFERENCES "Planificacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComunicadoObjetivoEstudiante" ADD CONSTRAINT "ComunicadoObjetivoEstudiante_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComunicadoObjetivoEstudiante" ADD CONSTRAINT "ComunicadoObjetivoEstudiante_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubrica" ADD CONSTRAINT "Rubrica_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubrica" ADD CONSTRAINT "Rubrica_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterioRubrica" ADD CONSTRAINT "CriterioRubrica_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterioRubrica" ADD CONSTRAINT "CriterioRubrica_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NivelCriterio" ADD CONSTRAINT "NivelCriterio_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NivelCriterio" ADD CONSTRAINT "NivelCriterio_criterioId_fkey" FOREIGN KEY ("criterioId") REFERENCES "CriterioRubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricaOa" ADD CONSTRAINT "RubricaOa_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricaOa" ADD CONSTRAINT "RubricaOa_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricaOa" ADD CONSTRAINT "RubricaOa_oaCodigo_fkey" FOREIGN KEY ("oaCodigo") REFERENCES "Oa"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionRubrica" ADD CONSTRAINT "AplicacionRubrica_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionRubrica" ADD CONSTRAINT "AplicacionRubrica_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionRubrica" ADD CONSTRAINT "AplicacionRubrica_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "Rubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionRubrica" ADD CONSTRAINT "AplicacionRubrica_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntajeCriterioRubrica" ADD CONSTRAINT "PuntajeCriterioRubrica_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntajeCriterioRubrica" ADD CONSTRAINT "PuntajeCriterioRubrica_aplicacionId_fkey" FOREIGN KEY ("aplicacionId") REFERENCES "AplicacionRubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntajeCriterioRubrica" ADD CONSTRAINT "PuntajeCriterioRubrica_criterioId_fkey" FOREIGN KEY ("criterioId") REFERENCES "CriterioRubrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntajeCriterioRubrica" ADD CONSTRAINT "PuntajeCriterioRubrica_nivelId_fkey" FOREIGN KEY ("nivelId") REFERENCES "NivelCriterio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionIdempotente" ADD CONSTRAINT "OperacionIdempotente_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionIdempotente" ADD CONSTRAINT "OperacionIdempotente_membresiaId_fkey" FOREIGN KEY ("membresiaId") REFERENCES "Membresia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingColegio" ADD CONSTRAINT "OnboardingColegio_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudTitular" ADD CONSTRAINT "SolicitudTitular_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoSolicitudTitular" ADD CONSTRAINT "EventoSolicitudTitular_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoSolicitudTitular" ADD CONSTRAINT "EventoSolicitudTitular_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudTitular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportacionEde" ADD CONSTRAINT "ExportacionEde_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportacionEde" ADD CONSTRAINT "ExportacionEde_anioEscolarId_fkey" FOREIGN KEY ("anioEscolarId") REFERENCES "AnioEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtefactoExportacionEde" ADD CONSTRAINT "ArtefactoExportacionEde_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtefactoExportacionEde" ADD CONSTRAINT "ArtefactoExportacionEde_exportacionId_fkey" FOREIGN KEY ("exportacionId") REFERENCES "ExportacionEde"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoEstudiante" ADD CONSTRAINT "AccesoEstudiante_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoEstudiante" ADD CONSTRAINT "AccesoEstudiante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoEstudiante" ADD CONSTRAINT "AccesoEstudiante_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrabajoOutbox" ADD CONSTRAINT "TrabajoOutbox_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificacionSistema" ADD CONSTRAINT "VerificacionSistema_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La evidencia normativa es append-only incluso frente a SQL accidental.
CREATE OR REPLACE FUNCTION "ciudi_proteger_audit_log"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es append-only';
END;
$$;

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "ciudi_proteger_audit_log"();

-- Las versiones publicadas de un curso no pueden solaparse.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "HorarioVersion"
  ADD CONSTRAINT "HorarioVersion_vigencia_check"
  CHECK ("vigenteHasta" IS NULL OR "vigenteHasta" >= "vigenteDesde");
ALTER TABLE "HorarioVersion"
  ADD CONSTRAINT "HorarioVersion_vigencias_sin_solape"
  EXCLUDE USING gist (
    "horarioCursoId" WITH =,
    daterange("vigenteDesde", COALESCE("vigenteHasta", 'infinity'::date), '[]') WITH &&
  )
  WHERE ("estado" = 'PUBLICADO');
