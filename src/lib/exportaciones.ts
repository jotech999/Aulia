/**
 * Exportadores de reportes normativos (P11). Cada función devuelve el nombre de
 * archivo y el CSV listo para descargar. Convenciones (ver lib/exportar.ts y la
 * consulta a experto-normativa):
 *  - RUT normalizado (ya se guarda así), fechas ISO, notas 1.0–7.0 con punto,
 *    porcentajes sin símbolo, separador `;`, BOM UTF-8.
 *  - NO incluye datos sensibles (ficha de salud, PIE) — Ley 21.719.
 *  - Etiquetas honestas: "apoyo SIGE" / "respaldo Circular 30", NO "archivo
 *    oficial" (SIGE no importa asistencia; EDE es un pipeline CEDS cifrado).
 */
import { prisma } from "@/lib/prisma";
import { construirCsv, nombreSeguro } from "@/lib/exportar";
import {
  calcularResumen,
  cuentaComoPresente,
  UMBRAL_ASISTENCIA,
  type EstadoAsistencia,
} from "@/lib/asistencia";
import {
  calcularPromedio,
  NOTA_APROBACION,
  promedioGeneral,
  situacionPromocionPorNota,
  type ItemPromedio,
} from "@/lib/calificaciones";
import { evaluarRiesgo } from "@/lib/riesgo";

type Salida = { archivo: string; csv: string };

const fISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const fISOhora = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "");
const nota1 = (n: number | null | undefined) => (n == null ? "" : n.toFixed(1));
const partirApellidos = (a: string): [string, string] => {
  const t = a.trim().split(/\s+/);
  return [t[0] ?? "", t.slice(1).join(" ")];
};

async function cargarCurso(colegioId: string, cursoId: string) {
  const [colegio, curso] = await Promise.all([
    prisma.colegio.findUnique({ where: { id: colegioId }, select: { rbd: true, nombre: true } }),
    prisma.curso.findFirst({
      where: { id: cursoId, colegioId },
      select: { nivel: true, letra: true, anioEscolar: { select: { anio: true } } },
    }),
  ]);
  return { colegio, curso };
}

/** Estudiantes con matrícula activa del curso, ordenados por apellido (lista). */
async function rosterCurso(colegioId: string, cursoId: string) {
  const matriculas = await prisma.matricula.findMany({
    where: { colegioId, cursoId, estado: "ACTIVA" },
    orderBy: { estudiante: { apellidos: "asc" } },
    select: {
      fecha: true,
      estudiante: {
        select: {
          id: true,
          rut: true,
          nombres: true,
          apellidos: true,
          fechaNacimiento: true,
          apoderados: {
            select: { parentesco: true, usuario: { select: { nombre: true, rut: true, email: true } } },
            take: 1,
          },
        },
      },
    },
  });
  return matriculas.map((m, i) => ({ ...m.estudiante, numero: i + 1, fechaMatricula: m.fecha }));
}

// ── 1. Planilla de asistencia mensual (apoyo declaración SIGE) ───────────────
export async function planillaAsistenciaMensual(
  colegioId: string,
  cursoId: string,
  anio: number,
  mes: number
): Promise<Salida> {
  const { colegio, curso } = await cargarCurso(colegioId, cursoId);
  const roster = await rosterCurso(colegioId, cursoId);
  const diasMes = new Date(anio, mes, 0).getUTCDate();
  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(anio, mes - 1, diasMes, 23, 59, 59));

  const asis = await prisma.asistenciaDiaria.findMany({
    where: { colegioId, estudianteId: { in: roster.map((e) => e.id) }, fecha: { gte: desde, lte: hasta } },
    select: { estudianteId: true, fecha: true, estado: true },
  });
  const porEst = new Map<string, Map<number, EstadoAsistencia>>();
  for (const a of asis) {
    const dia = a.fecha.getUTCDate();
    if (!porEst.has(a.estudianteId)) porEst.set(a.estudianteId, new Map());
    porEst.get(a.estudianteId)!.set(dia, a.estado as EstadoAsistencia);
  }

  const diasCols = Array.from({ length: diasMes }, (_, i) => `dia_${String(i + 1).padStart(2, "0")}`);
  const encabezados = [
    "rbd", "establecimiento", "anio", "mes", "grado", "letra",
    "num", "run", "apellido_paterno", "apellido_materno", "nombres",
    ...diasCols, "dias_asistidos", "dias_trabajados", "porcentaje_asistencia",
  ];

  const filas = roster.map((e) => {
    const marcas = porEst.get(e.id) ?? new Map<number, EstadoAsistencia>();
    let asistidos = 0, trabajados = 0;
    const dias: string[] = [];
    for (let d = 1; d <= diasMes; d++) {
      const dow = new Date(Date.UTC(anio, mes - 1, d)).getUTCDay();
      const finde = dow === 0 || dow === 6;
      const estado = marcas.get(d);
      if (finde) { dias.push("-"); continue; }
      if (estado === undefined) { dias.push(""); continue; }
      trabajados++;
      if (cuentaComoPresente(estado)) { asistidos++; dias.push("1"); }
      else dias.push("0");
    }
    const [pat, mat] = partirApellidos(e.apellidos);
    const pct = trabajados ? Math.round((asistidos / trabajados) * 1000) / 10 : "";
    return [
      colegio?.rbd ?? "", colegio?.nombre ?? "", anio, String(mes).padStart(2, "0"),
      curso ? curso.nivel : "", curso ? curso.letra : "",
      e.numero, e.rut, pat, mat, e.nombres,
      ...dias, asistidos, trabajados, pct,
    ];
  });

  const archivo = `asistencia_${nombreSeguro(`${curso?.nivel}${curso?.letra}`)}_${anio}-${String(mes).padStart(2, "0")}.csv`;
  return { archivo, csv: construirCsv(encabezados, filas) };
}

// ── 2. Acta de calificaciones y promoción (contenido Decreto 67) ─────────────
export async function actaCalificaciones(colegioId: string, cursoId: string): Promise<Salida> {
  const { colegio, curso } = await cargarCurso(colegioId, cursoId);
  const roster = await rosterCurso(colegioId, cursoId);
  const estIds = roster.map((e) => e.id);

  const asignaturas = await prisma.asignatura.findMany({
    where: { cursoId, colegioId },
    orderBy: { nombre: "asc" },
    select: {
      nombre: true,
      evaluaciones: {
        where: { eliminadaEn: null, tipo: "SUMATIVA" },
        select: {
          ponderacion: true,
          calificaciones: { where: { eliminadaEn: null }, select: { estudianteId: true, nota: true, eximida: true } },
        },
      },
    },
  });
  const asis = await prisma.asistenciaDiaria.findMany({
    where: {
      colegioId,
      estudianteId: { in: estIds },
      ...(curso
        ? {
            fecha: {
              gte: new Date(Date.UTC(curso.anioEscolar.anio, 0, 1)),
              lte: new Date(Date.UTC(curso.anioEscolar.anio, 11, 31)),
            },
          }
        : {}),
    },
    select: { estudianteId: true, estado: true },
  });
  const asisPorEst = new Map<string, EstadoAsistencia[]>();
  for (const a of asis) {
    if (!asisPorEst.has(a.estudianteId)) asisPorEst.set(a.estudianteId, []);
    asisPorEst.get(a.estudianteId)!.push(a.estado as EstadoAsistencia);
  }

  // Pre-índice por asignatura: cada evaluación con su calificación indexada por
  // estudiante (lookup O(1)), para no recorrer las calificaciones con `.find`
  // por cada estudiante del roster (O(estudiantes²)).
  const asignaturasIdx = asignaturas.map((a) =>
    a.evaluaciones.map((ev) => ({
      ponderacion: ev.ponderacion,
      porEst: new Map(ev.calificaciones.map((x) => [x.estudianteId, x])),
    }))
  );
  // nota final por (estudiante, asignatura)
  const notaFinal = (estId: string, asigIdx: number): number | null => {
    const items: ItemPromedio[] = asignaturasIdx[asigIdx].map((ev) => {
      const c = ev.porEst.get(estId);
      return { nota: c?.eximida ? null : c?.nota ?? null, ponderacion: ev.ponderacion, computa: !c?.eximida };
    });
    return calcularPromedio(items).promedio;
  };

  const encabezados = [
    "num", "run", "apellido_paterno", "apellido_materno", "nombres", "fecha_nacimiento",
    ...asignaturas.map((a) => `nota_${nombreSeguro(a.nombre)}`),
    "promedio_general", "porcentaje_asistencia", "situacion_final", "observaciones",
  ];

  const filas = roster.map((e) => {
    const notas = asignaturas.map((_, idx) => notaFinal(e.id, idx));
    const prom = promedioGeneral(notas.filter((n): n is number => n !== null));
    const resumen = calcularResumen(asisPorEst.get(e.id) ?? []);
    const pct = resumen.porcentaje;
    let situacion = "PENDIENTE";
    let obs = "";
    const finalesCompletas = notas.length > 0 && notas.every((n): n is number => n !== null);
    if (prom !== null && finalesCompletas) {
      const reglaNotas = situacionPromocionPorNota(notas);
      const asisOk = pct !== null && pct >= UMBRAL_ASISTENCIA;
      if (reglaNotas.promuevePorNota && asisOk) {
        situacion = "PROMUEVE_ART_10";
        obs = "Cumple criterios reglamentarios de calificaciones y asistencia del artículo 10.";
      } else {
        situacion = "REVISION_ART_11";
        const motivos = [
          !reglaNotas.promuevePorNota
            ? `${reglaNotas.reprobadas} asignatura(s) bajo 4,0; promedio general ${reglaNotas.general?.toFixed(1) ?? "pendiente"}`
            : null,
          !asisOk ? `asistencia ${pct === null ? "sin cierre" : `${pct}% (bajo 85%)`}` : null,
        ].filter(Boolean);
        obs = `Requiere análisis deliberativo y decisión fundada del establecimiento (art. 11): ${motivos.join("; ")}.`;
      }
    } else if (notas.some((nota) => nota !== null)) {
      obs = "Acta pendiente: faltan calificaciones finales de una o más asignaturas.";
    }
    const [pat, mat] = partirApellidos(e.apellidos);
    return [
      e.numero, e.rut, pat, mat, e.nombres, fISO(e.fechaNacimiento),
      ...notas.map(nota1),
      nota1(prom), pct ?? "", situacion, obs,
    ];
  });

  void colegio;
  const archivo = `acta_${nombreSeguro(`${curso?.nivel}${curso?.letra}`)}.csv`;
  return { archivo, csv: construirCsv(encabezados, filas) };
}

// ── 3a. Respaldo Circular 30 — antecedentes de estudiantes ───────────────────
export async function respaldoAntecedentes(colegioId: string, cursoId: string): Promise<Salida> {
  const { colegio, curso } = await cargarCurso(colegioId, cursoId);
  const roster = await rosterCurso(colegioId, cursoId);
  const encabezados = [
    "run", "apellido_paterno", "apellido_materno", "nombres", "fecha_nacimiento",
    "rbd", "grado", "letra", "fecha_matricula", "estado_matricula",
    "apoderado_nombre", "apoderado_rut", "apoderado_contacto", "parentesco",
  ];
  const filas = roster.map((e) => {
    const [pat, mat] = partirApellidos(e.apellidos);
    const apo = e.apoderados[0];
    return [
      e.rut, pat, mat, e.nombres, fISO(e.fechaNacimiento),
      colegio?.rbd ?? "", curso?.nivel ?? "", curso?.letra ?? "", fISO(e.fechaMatricula), "VIGENTE",
      apo?.usuario.nombre ?? "", apo?.usuario.rut ?? "", apo?.usuario.email ?? "", apo?.parentesco ?? "",
    ];
  });
  const archivo = `antecedentes_${nombreSeguro(`${curso?.nivel}${curso?.letra}`)}.csv`;
  return { archivo, csv: construirCsv(encabezados, filas) };
}

// ── 3b. Respaldo Circular 30 — control de asistencia (formato largo) ─────────
export async function respaldoControlAsistencia(colegioId: string, cursoId: string): Promise<Salida> {
  const { colegio, curso } = await cargarCurso(colegioId, cursoId);
  const roster = await rosterCurso(colegioId, cursoId);
  const rutPorEst = new Map(roster.map((e) => [e.id, e.rut]));
  const asis = await prisma.asistenciaDiaria.findMany({
    where: { colegioId, estudianteId: { in: roster.map((e) => e.id) } },
    orderBy: [{ fecha: "asc" }],
    select: { estudianteId: true, fecha: true, estado: true, registradoPorId: true, actualizadoEn: true },
  });
  const registradores = await prisma.usuario.findMany({
    // Defensa en profundidad: además del id, exige membresía en el colegio.
    where: {
      id: { in: [...new Set(asis.map((a) => a.registradoPorId))] },
      membresias: { some: { colegioId } },
    },
    select: { id: true, rut: true },
  });
  const rutReg = new Map(registradores.map((u) => [u.id, u.rut]));
  const encabezados = ["run_estudiante", "rbd", "grado", "letra", "fecha", "estado", "registrado_por_run", "registrado_en"];
  const filas = asis.map((a) => [
    rutPorEst.get(a.estudianteId) ?? "", colegio?.rbd ?? "", curso?.nivel ?? "", curso?.letra ?? "",
    fISO(a.fecha), a.estado, rutReg.get(a.registradoPorId) ?? "", fISOhora(a.actualizadoEn),
  ]);
  const archivo = `control_asistencia_${nombreSeguro(`${curso?.nivel}${curso?.letra}`)}.csv`;
  return { archivo, csv: construirCsv(encabezados, filas) };
}

// ── 3c. Respaldo Circular 30 — calificaciones (todas las notas parciales) ────
export async function respaldoCalificaciones(colegioId: string, cursoId: string): Promise<Salida> {
  const { curso } = await cargarCurso(colegioId, cursoId);
  const roster = await rosterCurso(colegioId, cursoId);
  const rutPorEst = new Map(roster.map((e) => [e.id, e.rut]));
  const asignaturas = await prisma.asignatura.findMany({
    where: { cursoId, colegioId },
    select: {
      nombre: true,
      docente: { select: { rut: true } },
      evaluaciones: {
        where: { eliminadaEn: null },
        select: {
          nombre: true, tipo: true, ponderacion: true, fecha: true,
          calificaciones: { where: { eliminadaEn: null }, select: { estudianteId: true, nota: true, eximida: true, actualizadaEn: true } },
        },
      },
    },
    orderBy: { nombre: "asc" },
  });
  const encabezados = ["run_estudiante", "asignatura", "evaluacion", "tipo", "fecha_evaluacion", "ponderacion", "nota", "eximido", "docente_run", "registrado_en"];
  const filas: Array<Array<string | number>> = [];
  for (const a of asignaturas) {
    for (const ev of a.evaluaciones) {
      for (const c of ev.calificaciones) {
        filas.push([
          rutPorEst.get(c.estudianteId) ?? "", a.nombre, ev.nombre, ev.tipo, fISO(ev.fecha),
          ev.ponderacion, nota1(c.nota), c.eximida ? "SI" : "NO", a.docente?.rut ?? "", fISOhora(c.actualizadaEn),
        ]);
      }
    }
  }
  const archivo = `calificaciones_${nombreSeguro(`${curso?.nivel}${curso?.letra}`)}.csv`;
  return { archivo, csv: construirCsv(encabezados, filas) };
}

// ── Reporte de alertas tempranas (Categoría de Desempeño / SAC) ──────────────
export async function reporteRiesgoCurso(colegioId: string, cursoId: string): Promise<Salida> {
  const { curso } = await cargarCurso(colegioId, cursoId);
  const roster = await rosterCurso(colegioId, cursoId);
  const estIds = roster.map((e) => e.id);

  const [asis, asignaturas, anotNeg, intervenciones] = await Promise.all([
    prisma.asistenciaDiaria.findMany({ where: { colegioId, estudianteId: { in: estIds } }, select: { estudianteId: true, estado: true } }),
    prisma.asignatura.findMany({
      where: { cursoId, colegioId },
      select: { evaluaciones: { where: { eliminadaEn: null, tipo: "SUMATIVA" }, select: { ponderacion: true, calificaciones: { where: { eliminadaEn: null }, select: { estudianteId: true, nota: true, eximida: true } } } } },
    }),
    prisma.anotacion.groupBy({ by: ["estudianteId"], where: { colegioId, estudianteId: { in: estIds }, tipo: "NEGATIVA", eliminadaEn: null }, _count: { _all: true } }),
    prisma.intervencion.groupBy({ by: ["estudianteId"], where: { colegioId, estudianteId: { in: estIds }, estado: "ABIERTA", eliminadaEn: null }, _count: { _all: true } }),
  ]);

  const asisPorEst = new Map<string, EstadoAsistencia[]>();
  for (const a of asis) (asisPorEst.get(a.estudianteId) ?? asisPorEst.set(a.estudianteId, []).get(a.estudianteId)!).push(a.estado as EstadoAsistencia);
  const negPorEst = new Map(anotNeg.map((g) => [g.estudianteId, g._count._all]));
  const ivPorEst = new Map(intervenciones.map((g) => [g.estudianteId, g._count._all]));

  // Pre-índice por asignatura: cada evaluación con su calificación indexada por
  // estudiante (lookup O(1)), para no recorrer las calificaciones con `.find`
  // por cada estudiante del roster (O(estudiantes²)).
  const asignaturasIdx = asignaturas.map((a) =>
    a.evaluaciones.map((ev) => ({
      ponderacion: ev.ponderacion,
      porEst: new Map(ev.calificaciones.map((x) => [x.estudianteId, x])),
    }))
  );

  const encabezados = ["run", "apellido_paterno", "apellido_materno", "nombres", "nivel_riesgo", "puntaje", "asistencia", "promedio", "asignaturas_reprobadas", "anotaciones_negativas", "intervenciones_abiertas", "factores"];
  const filas = roster.map((e) => {
    const resumen = calcularResumen(asisPorEst.get(e.id) ?? []);
    const finales: number[] = [];
    let reprobadas = 0;
    for (const evs of asignaturasIdx) {
      const items: ItemPromedio[] = evs.map((ev) => {
        const c = ev.porEst.get(e.id);
        return { nota: c?.eximida ? null : c?.nota ?? null, ponderacion: ev.ponderacion, computa: !c?.eximida };
      });
      const p = calcularPromedio(items).promedio;
      if (p !== null) { finales.push(p); if (p < NOTA_APROBACION) reprobadas++; }
    }
    const r = evaluarRiesgo({
      porcentajeAsistencia: resumen.porcentaje,
      diasConRegistro: resumen.diasConRegistro,
      asignaturasReprobadas: reprobadas,
      asignaturasConNota: finales.length,
      promedioGeneral: promedioGeneral(finales),
      anotacionesNegativas: negPorEst.get(e.id) ?? 0,
    });
    const [pat, mat] = partirApellidos(e.apellidos);
    return [
      e.rut, pat, mat, e.nombres, r.nivel, r.puntaje,
      resumen.porcentaje ?? "", nota1(promedioGeneral(finales)), reprobadas,
      negPorEst.get(e.id) ?? 0, ivPorEst.get(e.id) ?? 0,
      r.factores.map((f) => f.etiqueta).join(" | "),
    ];
  });
  const archivo = `alertas_riesgo_${nombreSeguro(`${curso?.nivel}${curso?.letra}`)}.csv`;
  return { archivo, csv: construirCsv(encabezados, filas) };
}
