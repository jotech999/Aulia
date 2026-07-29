import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Limitador compartido de inicio de sesión. La clave se persiste como SHA-256:
 * distintas instancias serverless observan el mismo contador sin almacenar el
 * correo o la IP en claro.
 */
const MAX_FALLOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const BLOQUEO_MS = 15 * 60 * 1000;

const hashClave = (clave: string) =>
  createHash("sha256").update(clave.trim().toLowerCase()).digest("hex");

export async function estaBloqueado(clave: string): Promise<boolean> {
  const registro = await prisma.limiteAutenticacion.findUnique({
    where: { claveHash: hashClave(clave) },
    select: { bloqueadoHasta: true },
  });
  return Boolean(registro?.bloqueadoHasta && registro.bloqueadoHasta > new Date());
}

/** Registra un fallo con aislamiento serializable y reintento de colisión. */
export async function registrarFallo(clave: string): Promise<void> {
  const claveHash = hashClave(clave);
  for (let intento = 0; intento < 3; intento++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const ahora = new Date();
          const registro = await tx.limiteAutenticacion.findUnique({
            where: { claveHash },
          });
          const ventanaExpirada =
            !registro || ahora.getTime() - registro.ventanaIniciaEn.getTime() > VENTANA_MS;

          if (!registro || ventanaExpirada) {
            await tx.limiteAutenticacion.upsert({
              where: { claveHash },
              create: { claveHash, intentos: 1, ventanaIniciaEn: ahora },
              update: {
                intentos: 1,
                ventanaIniciaEn: ahora,
                bloqueadoHasta: null,
              },
            });
            return;
          }

          const siguientes = registro.intentos + 1;
          await tx.limiteAutenticacion.update({
            where: { claveHash },
            data:
              siguientes >= MAX_FALLOS
                ? {
                    intentos: 0,
                    ventanaIniciaEn: ahora,
                    bloqueadoHasta: new Date(ahora.getTime() + BLOQUEO_MS),
                  }
                : { intentos: siguientes },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return;
    } catch (error) {
      const reintentable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!reintentable || intento === 2) throw error;
    }
  }
}

export async function limpiarIntentos(clave: string): Promise<void> {
  await prisma.limiteAutenticacion.deleteMany({
    where: { claveHash: hashClave(clave) },
  });
}

export async function minutosBloqueo(clave: string): Promise<number> {
  const registro = await prisma.limiteAutenticacion.findUnique({
    where: { claveHash: hashClave(clave) },
    select: { bloqueadoHasta: true },
  });
  if (!registro?.bloqueadoHasta) return 0;
  return Math.max(0, Math.ceil((registro.bloqueadoHasta.getTime() - Date.now()) / 60_000));
}
