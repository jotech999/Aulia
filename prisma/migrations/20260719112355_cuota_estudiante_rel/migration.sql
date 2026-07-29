-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
