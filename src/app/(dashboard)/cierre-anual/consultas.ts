import { prisma } from "@/lib/prisma";
import { calcularPromedio, aproximarDecima, type ItemPromedio } from "@/lib/calificaciones";
import { calcularResumen, type EstadoAsistencia } from "@/lib/asistencia";
import { evaluarPromocion, type ResultadoPromocion } from "@/lib/promocion";

/**
 * Consultas del CIERRE ANUAL. Reúne, por curso, el promedio final de cada
 * estudiante en cada asignatura (solo evaluaciones SUMATIVAS vivas), su
 * asistencia anual y la propuesta de promoción del Decreto 67.
 *
 * Multi-tenant: todas las consultas filtran por colegioId de la sesión.
 */

export type FilaCierre = {
  estudianteId: string;
  nombre: string;
  promediosPorAsignatura: { nombre: string; promedio: number | null }[];
  asistencia: number | null;
  diasConRegistro: number;
  propuesta: ResultadoPromocion;
  resolucion: {
    estado: string;
    fundamento: string;
    resueltoEn: Date;
  } | null;
};

export async function cursosDelAnioActivo(colegioId: string) {
  const anio = await prisma.anioEscolar.findFirst({
    where: { colegioId },
    orderBy: { anio: "desc" },
    select: { id: true, anio: true },
  });
  if (!anio) return { anio: null, cursos: [] as { id: string; nivel: string; letra: string }[] };
  const cursos = await prisma.curso.findMany({
    where: { colegioId, anioEscolarId: anio.id },
    select: { id: true, nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });
  return { anio, cursos };
}

/**
 * Arma la tabla de cierre de un curso. Un solo viaje por asignatura con sus
 * evaluaciones sumativas y calificaciones, para no hacer N+1 por estudiante.
 */
export async function cierreDeCurso(
  colegioId: string,
  cursoId: string,
  anioEscolarId: string
): Promise<FilaCierre[]> {
  const [matriculas, asignaturas] = await Promise.all([
    prisma.matricula.findMany({
      where: { cursoId, colegioId, estado: "ACTIVA" },
      select: {
        estudiante: { select: { id: true, nombres: true, apellidos: true } },
      },
    }),
    prisma.asignatura.findMany({
      where: { cursoId, colegioId },
      select: {
        nombre: true,
        evaluaciones: {
          where: { eliminadaEn: null, tipo: "SUMATIVA" },
          select: {
            ponderacion: true,
            calificaciones: {
              where: { eliminadaEn: null },
              select: { estudianteId: true, nota: true, eximida: true },
            },
          },
        },
      },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const ids = matriculas.map((m) => m.estudiante.id);
  if (ids.length === 0) return [];

  const [asistencias, resoluciones] = await Promise.all([
    prisma.asistenciaDiaria.findMany({
      where: { colegioId, estudianteId: { in: ids } },
      select: { estudianteId: true, estado: true },
    }),
    prisma.resolucionPromocion.findMany({
      where: { colegioId, anioEscolarId, estudianteId: { in: ids } },
      select: { estudianteId: true, estado: true, fundamento: true, resueltoEn: true },
    }),
  ]);

  const asisPorEst = new Map<string, EstadoAsistencia[]>();
  for (const a of asistencias) {
    const lista = asisPorEst.get(a.estudianteId) ?? [];
    lista.push(a.estado as EstadoAsistencia);
    asisPorEst.set(a.estudianteId, lista);
  }
  const resPorEst = new Map(resoluciones.map((r) => [r.estudianteId, r]));

  const filas = matriculas.map((m) => {
    const est = m.estudiante;
    const promedios = asignaturas.map((a) => {
      const items: ItemPromedio[] = a.evaluaciones.map((e) => {
        const cal = e.calificaciones.find((c) => c.estudianteId === est.id);
        return {
          nota: cal?.eximida ? null : cal?.nota ?? null,
          ponderacion: e.ponderacion,
          computa: !cal?.eximida,
        };
      });
      const p = calcularPromedio(items).promedio;
      return { nombre: a.nombre, promedio: p === null ? null : aproximarDecima(p) };
    });

    const resumen = calcularResumen(asisPorEst.get(est.id) ?? []);
    const propuesta = evaluarPromocion({
      asignaturas: promedios,
      asistencia: resumen.porcentaje,
    });
    const r = resPorEst.get(est.id);

    return {
      estudianteId: est.id,
      nombre: `${est.apellidos}, ${est.nombres}`,
      promediosPorAsignatura: promedios,
      asistencia: resumen.porcentaje,
      diasConRegistro: resumen.diasConRegistro,
      propuesta,
      resolucion: r
        ? { estado: r.estado, fundamento: r.fundamento, resueltoEn: r.resueltoEn }
        : null,
    };
  });

  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
