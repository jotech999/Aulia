-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'DIRECTOR', 'UTP', 'PROFESOR_JEFE', 'PROFESOR', 'INSPECTOR', 'APODERADO');

-- CreateEnum
CREATE TYPE "Regimen" AS ENUM ('SEMESTRAL', 'TRIMESTRAL');

-- CreateEnum
CREATE TYPE "EstadoMatricula" AS ENUM ('ACTIVA', 'RETIRADA');

-- CreateEnum
CREATE TYPE "EstadoAsistencia" AS ENUM ('PRESENTE', 'AUSENTE', 'ATRASADO', 'RETIRADO');

-- CreateEnum
CREATE TYPE "TipoAnotacion" AS ENUM ('POSITIVA', 'NEGATIVA', 'NEUTRA');

-- CreateTable
CREATE TABLE "Colegio" (
    "id" TEXT NOT NULL,
    "rbd" TEXT,
    "nombre" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Colegio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membresia" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,

    CONSTRAINT "Membresia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnioEscolar" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "regimen" "Regimen" NOT NULL DEFAULT 'SEMESTRAL',

    CONSTRAINT "AnioEscolar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "anioEscolarId" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "letra" TEXT NOT NULL,
    "profesorJefeId" TEXT,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estudiante" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "fechaNacimiento" DATE,
    "fichaSalud" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matricula" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "EstadoMatricula" NOT NULL DEFAULT 'ACTIVA',
    "retiradaEn" TIMESTAMP(3),

    CONSTRAINT "Matricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apoderado" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "parentesco" TEXT NOT NULL,

    CONSTRAINT "Apoderado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asignatura" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "docenteId" TEXT,

    CONSTRAINT "Asignatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueHorario" (
    "id" TEXT NOT NULL,
    "asignaturaId" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,

    CONSTRAINT "BloqueHorario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaseRegistrada" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "asignaturaId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "contenido" TEXT NOT NULL,
    "oaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firmadaPorId" TEXT,
    "firmadaEn" TIMESTAMP(3),

    CONSTRAINT "ClaseRegistrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsistenciaDiaria" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "EstadoAsistencia" NOT NULL,
    "registradoPorId" TEXT NOT NULL,

    CONSTRAINT "AsistenciaDiaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluacion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "asignaturaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'SUMATIVA',
    "ponderacion" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fecha" DATE NOT NULL,

    CONSTRAINT "Evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calificacion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "evaluacionId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "nota" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Calificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anotacion" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "tipo" "TipoAnotacion" NOT NULL,
    "texto" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anotacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "colegioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Colegio_rbd_key" ON "Colegio"("rbd");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_rut_key" ON "Usuario"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Membresia_colegioId_idx" ON "Membresia"("colegioId");

-- CreateIndex
CREATE UNIQUE INDEX "Membresia_usuarioId_colegioId_rol_key" ON "Membresia"("usuarioId", "colegioId", "rol");

-- CreateIndex
CREATE UNIQUE INDEX "AnioEscolar_colegioId_anio_key" ON "AnioEscolar"("colegioId", "anio");

-- CreateIndex
CREATE INDEX "Curso_colegioId_idx" ON "Curso"("colegioId");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_anioEscolarId_nivel_letra_key" ON "Curso"("anioEscolarId", "nivel", "letra");

-- CreateIndex
CREATE INDEX "Estudiante_colegioId_idx" ON "Estudiante"("colegioId");

-- CreateIndex
CREATE UNIQUE INDEX "Estudiante_colegioId_rut_key" ON "Estudiante"("colegioId", "rut");

-- CreateIndex
CREATE INDEX "Matricula_colegioId_idx" ON "Matricula"("colegioId");

-- CreateIndex
CREATE INDEX "Matricula_cursoId_idx" ON "Matricula"("cursoId");

-- CreateIndex
CREATE UNIQUE INDEX "Matricula_estudianteId_cursoId_key" ON "Matricula"("estudianteId", "cursoId");

-- CreateIndex
CREATE UNIQUE INDEX "Apoderado_usuarioId_estudianteId_key" ON "Apoderado"("usuarioId", "estudianteId");

-- CreateIndex
CREATE INDEX "Asignatura_colegioId_idx" ON "Asignatura"("colegioId");

-- CreateIndex
CREATE INDEX "Asignatura_cursoId_idx" ON "Asignatura"("cursoId");

-- CreateIndex
CREATE INDEX "BloqueHorario_asignaturaId_idx" ON "BloqueHorario"("asignaturaId");

-- CreateIndex
CREATE INDEX "ClaseRegistrada_colegioId_idx" ON "ClaseRegistrada"("colegioId");

-- CreateIndex
CREATE INDEX "ClaseRegistrada_asignaturaId_fecha_idx" ON "ClaseRegistrada"("asignaturaId", "fecha");

-- CreateIndex
CREATE INDEX "AsistenciaDiaria_colegioId_fecha_idx" ON "AsistenciaDiaria"("colegioId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaDiaria_estudianteId_fecha_key" ON "AsistenciaDiaria"("estudianteId", "fecha");

-- CreateIndex
CREATE INDEX "Evaluacion_colegioId_idx" ON "Evaluacion"("colegioId");

-- CreateIndex
CREATE INDEX "Evaluacion_asignaturaId_idx" ON "Evaluacion"("asignaturaId");

-- CreateIndex
CREATE INDEX "Calificacion_colegioId_idx" ON "Calificacion"("colegioId");

-- CreateIndex
CREATE UNIQUE INDEX "Calificacion_evaluacionId_estudianteId_key" ON "Calificacion"("evaluacionId", "estudianteId");

-- CreateIndex
CREATE INDEX "Anotacion_colegioId_idx" ON "Anotacion"("colegioId");

-- CreateIndex
CREATE INDEX "Anotacion_estudianteId_idx" ON "Anotacion"("estudianteId");

-- CreateIndex
CREATE INDEX "AuditLog_colegioId_entidad_entidadId_idx" ON "AuditLog"("colegioId", "entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_colegioId_ts_idx" ON "AuditLog"("colegioId", "ts");

-- AddForeignKey
ALTER TABLE "Membresia" ADD CONSTRAINT "Membresia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membresia" ADD CONSTRAINT "Membresia_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnioEscolar" ADD CONSTRAINT "AnioEscolar_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_anioEscolarId_fkey" FOREIGN KEY ("anioEscolarId") REFERENCES "AnioEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_profesorJefeId_fkey" FOREIGN KEY ("profesorJefeId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estudiante" ADD CONSTRAINT "Estudiante_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apoderado" ADD CONSTRAINT "Apoderado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apoderado" ADD CONSTRAINT "Apoderado_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignatura" ADD CONSTRAINT "Asignatura_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignatura" ADD CONSTRAINT "Asignatura_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignatura" ADD CONSTRAINT "Asignatura_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueHorario" ADD CONSTRAINT "BloqueHorario_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaseRegistrada" ADD CONSTRAINT "ClaseRegistrada_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaDiaria" ADD CONSTRAINT "AsistenciaDiaria_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_asignaturaId_fkey" FOREIGN KEY ("asignaturaId") REFERENCES "Asignatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calificacion" ADD CONSTRAINT "Calificacion_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calificacion" ADD CONSTRAINT "Calificacion_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anotacion" ADD CONSTRAINT "Anotacion_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_colegioId_fkey" FOREIGN KEY ("colegioId") REFERENCES "Colegio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
