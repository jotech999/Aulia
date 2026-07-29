-- CreateEnum
CREATE TYPE "TipoPregunta" AS ENUM ('ALTERNATIVAS', 'VF', 'RESPUESTA_CORTA');

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "asignaturaId" TEXT NOT NULL,
    "tipo" "TipoPregunta" NOT NULL,
    "enunciado" TEXT NOT NULL,
    "oaCodigo" TEXT,
    "puntaje" INTEGER NOT NULL DEFAULT 1,
    "vfCorrecta" BOOLEAN,
    "respuestaEsperada" TEXT,
    "autorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadaEn" TIMESTAMP(3),

    CONSTRAINT "Pregunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alternativa" (
    "id" TEXT NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "correcta" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Alternativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "asignaturaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadoEn" TIMESTAMP(3),

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizPregunta" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizPregunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoQuiz" (
    "id" TEXT NOT NULL,
    "colegioId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "puntaje" INTEGER NOT NULL,
    "puntajeMax" INTEGER NOT NULL,
    "nota" DOUBLE PRECISION NOT NULL,
    "corregidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultadoQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pregunta_colegioId_idx" ON "Pregunta"("colegioId");

-- CreateIndex
CREATE INDEX "Pregunta_asignaturaId_idx" ON "Pregunta"("asignaturaId");

-- CreateIndex
CREATE INDEX "Alternativa_preguntaId_idx" ON "Alternativa"("preguntaId");

-- CreateIndex
CREATE INDEX "Quiz_colegioId_idx" ON "Quiz"("colegioId");

-- CreateIndex
CREATE INDEX "Quiz_asignaturaId_idx" ON "Quiz"("asignaturaId");

-- CreateIndex
CREATE INDEX "QuizPregunta_quizId_idx" ON "QuizPregunta"("quizId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizPregunta_quizId_preguntaId_key" ON "QuizPregunta"("quizId", "preguntaId");

-- CreateIndex
CREATE INDEX "ResultadoQuiz_colegioId_idx" ON "ResultadoQuiz"("colegioId");

-- CreateIndex
CREATE INDEX "ResultadoQuiz_quizId_idx" ON "ResultadoQuiz"("quizId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoQuiz_quizId_estudianteId_key" ON "ResultadoQuiz"("quizId", "estudianteId");

-- AddForeignKey
ALTER TABLE "Alternativa" ADD CONSTRAINT "Alternativa_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizPregunta" ADD CONSTRAINT "QuizPregunta_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizPregunta" ADD CONSTRAINT "QuizPregunta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoQuiz" ADD CONSTRAINT "ResultadoQuiz_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
