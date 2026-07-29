-- AlterTable
ALTER TABLE "Evaluacion" ADD COLUMN     "quizId" TEXT;

-- CreateIndex
CREATE INDEX "Evaluacion_quizId_idx" ON "Evaluacion"("quizId");
