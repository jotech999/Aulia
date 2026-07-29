-- AlterTable
ALTER TABLE "Colegio" ADD COLUMN     "notifsApoderadoHabilitada" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Notificacion" ADD COLUMN     "emailEnviadoEn" TIMESTAMP(3);
