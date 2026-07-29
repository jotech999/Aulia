import { NextRequest } from "next/server";
import { requerirSesion } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { generarBoletinesCursoPdf } from "@/lib/pdf/certificado";
import {
  autorizarEmision,
  LEYENDA_INFORME_SEMESTRAL,
  LEYENDA_INFORME_ANUAL,
  type SnapshotCertificado,
  type AsignaturaNotas,
} from "@/lib/certificados";
import { calcularPromedio, promedioGeneral, type ItemPromedio } from "@/lib/calificaciones";
import { calcularResumen, type EstadoAsistencia } from "@/lib/asistencia";
import { hoyEnSantiago } from "@/lib/fecha";

/**
 * Boletines de todo un curso en un solo PDF (una página por estudiante).
 * Documento interno de trabajo (sin folio); el oficial se emite por estudiante.
 * Sólo dirección/UTP o el profesor jefe del curso.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cursoId: string }> }
) {
  const { user } = await requerirSesion();
  const { cursoId } = await params;
  const sp = req.nextUrl.searchParams;
  const anual = sp.get("anual") === "1";
  const periodo = anual ? null : Math.min(Math.max(Number(sp.get("periodo")) || 1, 1), 3);

  const curso = await prisma.curso.findFirst({
    where: { id: cursoId, colegioId: user.colegioId }, // multi-tenant
    select: {
      nivel: true,
      letra: true,
      profesorJefeId: true,
      anioEscolar: { select: { anio: true } },
      matriculas: {
        where: { estado: "ACTIVA" },
        orderBy: { estudiante: { apellidos: "asc" } },
        select: { estudiante: { select: { id: true, nombres: true, apellidos: true, rut: true } } },
      },
      asignaturas: {
        orderBy: { nombre: "asc" },
        select: {
          nombre: true,
          evaluaciones: {
            where: { eliminadaEn: null, tipo: "SUMATIVA" },
            select: {
              periodo: true,
              ponderacion: true,
              calificaciones: { where: { eliminadaEn: null }, select: { estudianteId: true, nota: true, eximida: true } },
            },
          },
        },
      },
    },
  });
  if (!curso) return new Response("Curso no encontrado", { status: 404 });

  // Autorización: gestión o profesor jefe del curso.
  if (!autorizarEmision("INFORME_SEMESTRAL", user.rol, user.id, { profesorJefeId: curso.profesorJefeId })) {
    return new Response("Prohibido", { status: 403 });
  }

  const colegio = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: { nombre: true, rbd: true, direccion: true, comuna: true, directorCargo: true, directorNombre: true },
  });

  const estIds = curso.matriculas.map((m) => m.estudiante.id);
  const asis = await prisma.asistenciaDiaria.findMany({
    where: { colegioId: user.colegioId, estudianteId: { in: estIds } },
    select: { estudianteId: true, estado: true },
  });
  const asisPorEst = new Map<string, EstadoAsistencia[]>();
  for (const a of asis) {
    (asisPorEst.get(a.estudianteId) ?? asisPorEst.set(a.estudianteId, []).get(a.estudianteId)!).push(a.estado as EstadoAsistencia);
  }

  // Pre-índice: por asignatura, cada evaluación con su calificación indexada por
  // estudiante (lookup O(1)), para no recorrer las calificaciones con `.find`
  // por cada estudiante del curso (O(estudiantes²)).
  const asignaturasIdx = curso.asignaturas.map((a) => ({
    nombre: a.nombre,
    evalsIdx: a.evaluaciones.map((ev) => ({
      periodo: ev.periodo,
      ponderacion: ev.ponderacion,
      porEst: new Map(ev.calificaciones.map((x) => [x.estudianteId, x])),
    })),
  }));

  type EvalIdx = { periodo: number; ponderacion: number; porEst: Map<string, { estudianteId: string; nota: number | null; eximida: boolean }> };
  const promAsigEst = (estId: string, evals: EvalIdx[], per: number | null): number | null => {
    const items: ItemPromedio[] = evals
      .filter((e) => per == null || e.periodo === per)
      .map((e) => {
        const c = e.porEst.get(estId);
        return { nota: c?.eximida ? null : c?.nota ?? null, ponderacion: e.ponderacion, computa: !c?.eximida };
      });
    return calcularPromedio(items).promedio;
  };

  const hoy = hoyEnSantiago();
  const items = curso.matriculas.map((m) => {
    const e = m.estudiante;
    const asignaturas: AsignaturaNotas[] = asignaturasIdx.map((a) => {
      if (anual) {
        const s1 = promAsigEst(e.id, a.evalsIdx, 1);
        const s2 = promAsigEst(e.id, a.evalsIdx, 2);
        return {
          asignatura: a.nombre,
          evaluaciones: [],
          promedioS1: s1,
          promedioS2: s2,
          promedio: promedioGeneral([s1, s2].filter((p): p is number => p != null)),
        };
      }
      return { asignatura: a.nombre, evaluaciones: [], promedio: promAsigEst(e.id, a.evalsIdx, periodo) };
    });
    const resumen = calcularResumen(asisPorEst.get(e.id) ?? []);
    const snapshot: SnapshotCertificado = {
      colegio: {
        nombre: colegio?.nombre ?? "",
        rbd: colegio?.rbd ?? null,
        direccion: colegio?.direccion ?? null,
        comuna: colegio?.comuna ?? null,
      },
      estudiante: { nombres: e.nombres, apellidos: e.apellidos, rut: e.rut },
      curso: `${curso.nivel} ${curso.letra}`,
      anio: curso.anioEscolar.anio,
      emisor: { nombre: colegio?.directorNombre ?? "Dirección", cargo: colegio?.directorCargo ?? "Dirección" },
      emitidoEnISO: hoy,
      anual,
      asignaturas,
      periodo: anual ? undefined : periodo ?? 1,
      asistenciaPct: resumen.porcentaje,
      asistenciaDias: resumen.diasConRegistro,
      promedioGeneral: promedioGeneral(asignaturas.map((a) => a.promedio).filter((p): p is number => p != null)),
      leyenda: anual ? LEYENDA_INFORME_ANUAL : LEYENDA_INFORME_SEMESTRAL,
    };
    return { tipo: anual ? ("INFORME_ANUAL" as const) : ("INFORME_SEMESTRAL" as const), snapshot };
  });

  const pdf = await generarBoletinesCursoPdf(items);

  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "EXPORTAR",
    entidad: "curso",
    entidadId: cursoId,
    despues: { tipo: anual ? "boletines_anual" : "boletines_semestral", periodo, n: items.length },
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="boletines-${curso.nivel}${curso.letra}${anual ? "-anual" : `-sem${periodo}`}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
