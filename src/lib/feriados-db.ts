/**
 * Lectura de la tabla configurable `Feriado` (nacionales + locales del colegio).
 * Separado de `feriados.ts` (constante pura de referencia) para que el seed y
 * las funciones puras/sincrónicas no arrastren el cliente Prisma.
 */
import { prisma } from "@/lib/prisma";
import { isoDesdeFecha } from "@/lib/fecha";
import { FERIADOS_CL } from "@/lib/feriados";

/**
 * Feriados vigentes para un colegio en un rango de fechas ISO (inclusive),
 * leídos de la tabla `Feriado`: nacionales (`colegioId` null) + los
 * locales/regionales del colegio. Si la tabla aún no está sembrada, cae a la
 * constante de referencia FERIADOS_CL para no romper el cálculo del cierre
 * SIGE. Devuelve un Set de fechas ISO "YYYY-MM-DD".
 */
export async function feriadosEnRango(
  colegioId: string,
  desdeIso: string,
  hastaIso: string
): Promise<Set<string>> {
  const filas = await prisma.feriado.findMany({
    where: {
      OR: [{ colegioId: null }, { colegioId }],
      fecha: {
        gte: new Date(`${desdeIso}T00:00:00Z`),
        lte: new Date(`${hastaIso}T00:00:00Z`),
      },
    },
    select: { fecha: true },
  });
  if (filas.length === 0) {
    // Fallback a la constante mientras la tabla no esté sembrada.
    return new Set(
      Object.keys(FERIADOS_CL).filter((iso) => iso >= desdeIso && iso <= hastaIso)
    );
  }
  return new Set(filas.map((f) => isoDesdeFecha(f.fecha)));
}
