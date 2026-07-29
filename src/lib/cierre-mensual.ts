/**
 * Cierre mensual para declaración SIGE. Reúne, por curso y mes, las validaciones
 * que un director necesita ANTES de declarar asistencia/matrícula en el portal
 * de Mineduc: días hábiles, días sin asistencia tomada, clases sin firmar,
 * matrícula activa e inconsistencias, más la asistencia media del mes (el número
 * clave para subvención). SIGE no importa archivos de asistencia (es carga
 * manual en el portal); esta pantalla evita declarar con datos incompletos.
 */
import { prisma } from "@/lib/prisma";
import { cuentaComoPresente, type EstadoAsistencia } from "@/lib/asistencia";
import { hoyEnSantiago, isoDesdeFecha } from "@/lib/fecha";
import { feriadosEnRango } from "@/lib/feriados-db";

export type CierreCurso = {
  cursoId: string;
  nivel: string;
  letra: string;
  matriculaActiva: number;
  diasHabilesTranscurridos: number;
  diasConAsistencia: number;
  diasSinAsistencia: number;
  clasesRegistradas: number;
  clasesSinFirmar: number;
  asistenciaMedia: number | null; // 0–100
  estado: "ok" | "atencion";
  alertas: string[];
};

export type CierreMensual = {
  anio: number;
  mes: number;
  diasHabilesMes: number;
  diasHabilesTranscurridos: number;
  cursos: CierreCurso[];
};

/**
 * Días hábiles escolares de un mes: días de semana (lun–vie) EXCLUYENDO los
 * feriados legales de Chile (no hay jornada, así que no cuentan como día sin
 * asistencia). Opcionalmente hasta un tope de día.
 */
function diasHabilesDe(
  anio: number,
  mes: number,
  feriados: Set<string>,
  hastaDia?: number
): string[] {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const tope = hastaDia ? Math.min(hastaDia, ultimo) : ultimo;
  const out: string[] = [];
  for (let d = 1; d <= tope; d++) {
    const dow = new Date(Date.UTC(anio, mes - 1, d)).getUTCDay();
    if (dow < 1 || dow > 5) continue; // fin de semana
    const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (feriados.has(iso)) continue; // feriado legal: no es día hábil escolar
    out.push(iso);
  }
  return out;
}

export async function calcularCierreMensual(
  colegioId: string,
  anio: number,
  mes: number
): Promise<CierreMensual> {
  const hoy = hoyEnSantiago();
  const [ay, am, ad] = hoy.split("-").map(Number);
  // Días transcurridos: si el mes es el actual, hasta hoy; si es pasado, todo el mes.
  const esMesActual = ay === anio && am === mes;
  const esFuturo = anio > ay || (anio === ay && mes > am);
  // Feriados del mes desde la tabla configurable (nacionales + del colegio).
  const ultimoDiaMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const feriadosMes = await feriadosEnRango(
    colegioId,
    `${anio}-${String(mes).padStart(2, "0")}-01`,
    `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDiaMes).padStart(2, "0")}`
  );
  const diasHabilesMesBase = diasHabilesDe(anio, mes, feriadosMes);
  const diasHabilesTransBase = esFuturo
    ? []
    : diasHabilesDe(anio, mes, feriadosMes, esMesActual ? ad : undefined);

  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(anio, mes, 0, 23, 59, 59));

  const cursos = await prisma.curso.findMany({
    where: { colegioId, anioEscolar: { anio } },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
    select: {
      id: true,
      nivel: true,
      letra: true,
      matriculas: {
        where: {
          colegioId,
          fecha: { lte: hasta },
          OR: [{ retiradaEn: null }, { retiradaEn: { gte: desde } }],
        },
        select: { estudianteId: true },
      },
      asignaturas: { select: { id: true } },
    },
  });

  // Asistencia del mes (todos los cursos) y clases del mes, en dos queries.
  const estIds = cursos.flatMap((c) => c.matriculas.map((m) => m.estudianteId));
  const asignaturaCurso = new Map<string, string>();
  for (const c of cursos) for (const a of c.asignaturas) asignaturaCurso.set(a.id, c.id);

  const [asis, clases, suspensiones] = await Promise.all([
    estIds.length
      ? prisma.asistenciaDiaria.findMany({
          where: { colegioId, estudianteId: { in: estIds }, fecha: { gte: desde, lte: hasta } },
          select: { estudianteId: true, fecha: true, estado: true },
        })
      : Promise.resolve([]),
    prisma.claseRegistrada.findMany({
      where: { colegioId, eliminadaEn: null, fecha: { gte: desde, lte: hasta } },
      select: { asignaturaId: true, firmadaEn: true },
    }),
    prisma.eventoEscolar.findMany({
      where: {
        colegioId,
        tipo: "SUSPENSION",
        eliminadaEn: null,
        fecha: { gte: desde, lte: hasta },
        OR: [{ cursoId: null }, { cursoId: { in: cursos.map((curso) => curso.id) } }],
      },
      select: { cursoId: true, fecha: true },
    }),
  ]);

  const suspensionesGlobales = new Set(
    suspensiones.filter((evento) => evento.cursoId === null).map((evento) => isoDesdeFecha(evento.fecha))
  );
  const suspensionesPorCurso = new Map<string, Set<string>>();
  for (const evento of suspensiones) {
    if (!evento.cursoId) continue;
    const fechas = suspensionesPorCurso.get(evento.cursoId) ?? new Set<string>();
    fechas.add(isoDesdeFecha(evento.fecha));
    suspensionesPorCurso.set(evento.cursoId, fechas);
  }
  const diasHabilesMesArr = diasHabilesMesBase.filter((dia) => !suspensionesGlobales.has(dia));
  const diasHabilesTransArr = diasHabilesTransBase.filter((dia) => !suspensionesGlobales.has(dia));

  const estCurso = new Map<string, string>();
  for (const c of cursos) for (const m of c.matriculas) estCurso.set(m.estudianteId, c.id);

  // Agrupa asistencia por curso: días con registro + presentes/total.
  const registrosPorDiaCurso = new Map<string, Map<string, number>>();
  const presPorCurso = new Map<string, { pres: number; total: number }>();
  for (const a of asis) {
    const cId = estCurso.get(a.estudianteId);
    if (!cId) continue;
    const iso = isoDesdeFecha(a.fecha);
    const porDia = registrosPorDiaCurso.get(cId) ?? new Map<string, number>();
    porDia.set(iso, (porDia.get(iso) ?? 0) + 1);
    registrosPorDiaCurso.set(cId, porDia);
    const p = presPorCurso.get(cId) ?? { pres: 0, total: 0 };
    p.total++;
    if (cuentaComoPresente(a.estado as EstadoAsistencia)) p.pres++;
    presPorCurso.set(cId, p);
  }

  // Clases por curso: total y sin firmar.
  const clasesPorCurso = new Map<string, { total: number; sinFirmar: number }>();
  for (const cl of clases) {
    const cId = asignaturaCurso.get(cl.asignaturaId);
    if (!cId) continue;
    const c = clasesPorCurso.get(cId) ?? { total: 0, sinFirmar: 0 };
    c.total++;
    if (!cl.firmadaEn) c.sinFirmar++;
    clasesPorCurso.set(cId, c);
  }

  const cursosOut: CierreCurso[] = cursos.map((c) => {
    const suspensionesCurso = suspensionesPorCurso.get(c.id) ?? new Set<string>();
    const diasEsperados = diasHabilesTransArr.filter((dia) => !suspensionesCurso.has(dia));
    const registrosPorDia = registrosPorDiaCurso.get(c.id) ?? new Map<string, number>();
    const diasConAsistencia = diasEsperados.filter(
      (dia) => c.matriculas.length > 0 && (registrosPorDia.get(dia) ?? 0) >= c.matriculas.length
    ).length;
    const diasSinAsistencia = diasEsperados.length - diasConAsistencia;
    const pres = presPorCurso.get(c.id);
    const asistenciaMedia = pres && pres.total ? Math.round((pres.pres / pres.total) * 1000) / 10 : null;
    const cl = clasesPorCurso.get(c.id) ?? { total: 0, sinFirmar: 0 };

    const alertas: string[] = [];
    if (c.matriculas.length === 0) alertas.push("Sin matrícula activa");
    if (diasSinAsistencia > 0) alertas.push(`${diasSinAsistencia} jornada(s) sin asistencia completa para toda la nómina`);
    if (cl.sinFirmar > 0) alertas.push(`${cl.sinFirmar} clase(s) registrada(s) sin firmar`);
    if (anio !== 2026) alertas.push("Calendario de feriados legales pendiente de verificación para este año");

    return {
      cursoId: c.id,
      nivel: c.nivel,
      letra: c.letra,
      matriculaActiva: c.matriculas.length,
      diasHabilesTranscurridos: diasEsperados.length,
      diasConAsistencia,
      diasSinAsistencia,
      clasesRegistradas: cl.total,
      clasesSinFirmar: cl.sinFirmar,
      asistenciaMedia,
      estado: alertas.length === 0 ? "ok" : "atencion",
      alertas,
    };
  });

  return {
    anio,
    mes,
    diasHabilesMes: diasHabilesMesArr.length,
    diasHabilesTranscurridos: diasHabilesTransArr.length,
    cursos: cursosOut,
  };
}
