import { prisma } from "@/lib/prisma";
import { hoyEnSantiago } from "@/lib/fecha";

/**
 * Métricas agregadas por colegio para el panel del SOSTENEDOR (dueño de una red).
 *
 * Multi-tenant estricto: el llamador debe pasar ÚNICAMENTE los `colegioIds`
 * donde el usuario tiene membresía SOSTENEDOR (ver la página). Este módulo nunca
 * consulta "todos los colegios": solo agrega los que recibe.
 *
 * Minimización (Ley 21.719): el sostenedor ve SOLO indicadores agregados por
 * colegio (recuentos, promedios, porcentajes). Nunca datos individuales de
 * estudiantes ni acceso de escritura al libro de clases.
 */

export type MetricaColegio = {
  colegioId: string;
  nombre: string;
  estudiantes: number;
  asistenciaMedia: number | null; // % (presentes+atrasados / marcas)
  promedioGeneral: number | null; // 1.0–7.0
  intervencionesAbiertas: number; // señal de atención (módulo de alertas)
  recaudacionPct: number | null; // % del arancel cobrado (monto pagado / total no anulado)
};

async function metricaDeColegio(colegioId: string, nombre: string): Promise<MetricaColegio> {
  // Año escolar vigente del colegio: las métricas se acotan a él para no mezclar
  // periodos cuando el colegio lleva más de un año en la plataforma (la
  // "asistencia media", el promedio y la recaudación deben reflejar el año actual).
  // Se toma el año más reciente que NO sea futuro (America/Santiago), para que un
  // año configurado por anticipado no adelante las métricas a un periodo vacío.
  const anioActual = Number(hoyEnSantiago().slice(0, 4));
  const anio = await prisma.anioEscolar.findFirst({
    where: { colegioId, anio: { lte: anioActual } },
    orderBy: { anio: "desc" },
    select: { id: true, anio: true },
  });
  if (!anio) {
    // Colegio sin año escolar configurado: sin datos comparables.
    return { colegioId, nombre, estudiantes: 0, asistenciaMedia: null, promedioGeneral: null, intervencionesAbiertas: 0, recaudacionPct: null };
  }
  // Rango de fechas del año escolar (año calendario, hora Chile → UTC medianoche).
  const desde = new Date(Date.UTC(anio.anio, 0, 1));
  const hasta = new Date(Date.UTC(anio.anio + 1, 0, 1));

  const [estudiantes, asistencia, notas, intervencionesAbiertas, cuotas] = await Promise.all([
    // Estudiantes con matrícula activa en un curso del año vigente.
    prisma.matricula.count({ where: { colegioId, estado: "ACTIVA", curso: { anioEscolarId: anio.id } } }),
    prisma.asistenciaDiaria.groupBy({
      by: ["estado"],
      where: { colegioId, fecha: { gte: desde, lt: hasta } },
      _count: { _all: true },
    }),
    prisma.calificacion.aggregate({
      // Solo notas sumativas del año vigente entran al promedio (Decreto 67: la
      // formativa no promedia). Se acota vía el curso de la evaluación.
      where: {
        colegioId,
        eliminadaEn: null,
        eximida: false,
        nota: { not: null },
        evaluacion: { tipo: "SUMATIVA", asignatura: { curso: { anioEscolarId: anio.id } } },
      },
      _avg: { nota: true },
    }),
    prisma.intervencion.count({ where: { colegioId, estado: "ABIERTA", eliminadaEn: null } }),
    prisma.cuota.groupBy({
      by: ["estado"],
      where: { colegioId, estado: { not: "ANULADA" }, vencimiento: { gte: desde, lt: hasta } },
      _sum: { monto: true },
    }),
  ]);

  const totalMarcas = asistencia.reduce((s, a) => s + a._count._all, 0);
  const presentes = asistencia.find((a) => a.estado === "PRESENTE")?._count._all ?? 0;
  const atrasos = asistencia.find((a) => a.estado === "ATRASADO")?._count._all ?? 0;
  const asistenciaMedia = totalMarcas ? Math.round(((presentes + atrasos) / totalMarcas) * 100) : null;

  const montoTotal = cuotas.reduce((s, c) => s + (c._sum.monto ?? 0), 0);
  const montoPagado = cuotas.find((c) => c.estado === "PAGADA")?._sum.monto ?? 0;
  const recaudacionPct = montoTotal > 0 ? Math.round((montoPagado / montoTotal) * 100) : null;

  return {
    colegioId,
    nombre,
    estudiantes,
    asistenciaMedia,
    promedioGeneral: notas._avg.nota != null ? Math.round(notas._avg.nota * 10) / 10 : null,
    intervencionesAbiertas,
    recaudacionPct,
  };
}

/**
 * Devuelve las métricas de los colegios indicados (solo los de la red del
 * sostenedor). Ordenadas por nombre para una comparación estable.
 */
export async function metricasRed(colegioIds: string[]): Promise<MetricaColegio[]> {
  if (colegioIds.length === 0) return [];
  const colegios = await prisma.colegio.findMany({
    where: { id: { in: colegioIds } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  return Promise.all(colegios.map((c) => metricaDeColegio(c.id, c.nombre)));
}
