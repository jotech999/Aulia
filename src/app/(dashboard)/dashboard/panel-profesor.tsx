import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { whereCursosAccesibles } from "@/app/(dashboard)/libro-clases/asistencia/consultas";
import {
  calcularPromedio,
  promedioGeneral,
  NOTA_APROBACION,
  type ItemPromedio,
} from "@/lib/calificaciones";
import { formatearFechaLarga, hoyEnSantiago, isoDesdeFecha, fechaDesdeISO } from "@/lib/fecha";
import { Iconos } from "@/components/ui/iconos";
import { AccesosRapidos } from "@/components/ui/accesos-rapidos";
import { InsightsAulia } from "@/components/insights-aulia";
import { Sparkline } from "@/components/ui/graficos";
import { TarjetaKPI } from "@/components/ui/tarjeta-kpi";
import { Insignia } from "@/components/ui/insignia";
import { colorAsignatura } from "@/lib/colores-asignatura";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";

const fmtDia = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);

const DIA_LARGO = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Día de la semana (1=lunes … 7=domingo) para una fecha ISO chilena. */
function diaSemana(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=domingo … 6=sábado
  return d === 0 ? 7 : d;
}

function CheckMini() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
      <path d="M4 10.5l3.5 3.5L16 5.5" />
    </svg>
  );
}

export async function PanelProfesor({
  usuarioId,
  colegioId,
  rol,
  nombre,
  colegioNombre,
}: {
  usuarioId: string;
  colegioId: string;
  rol: string;
  nombre?: string | null;
  colegioNombre?: string;
}) {
  const hoy = hoyEnSantiago();
  const diaHoy = diaSemana(hoy);
  const user = { id: usuarioId, rol, colegioId };

  // Ventana de recordatorios: evaluaciones de los próximos 7 días.
  const desdeHoy = fechaDesdeISO(hoy);
  const hasta7 = new Date(desdeHoy.getTime() + 7 * 86400000);

  const [cursos, sinFirmar, evalsProximas] = await Promise.all([
    prisma.curso.findMany({
      where: whereCursosAccesibles(user),
      select: {
        id: true,
        nivel: true,
        letra: true,
        profesorJefeId: true,
        matriculas: {
          where: { colegioId, estado: "ACTIVA" },
          select: { estudianteId: true },
        },
        asignaturas: {
          where: { docenteId: usuarioId },
          select: {
            id: true,
            nombre: true,
            color: true,
            // Solo los bloques de HOY (para "Tus clases de hoy").
            bloques: {
              where: {
                colegioId,
                dia: diaHoy,
                eliminadaEn: null,
                horarioVersion: { estado: "PUBLICADO", vigenteDesde: { lte: desdeHoy }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: desdeHoy } }] },
              },
              select: { id: true, horaInicio: true, horaFin: true },
            },
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
        },
      },
      orderBy: [{ nivel: "asc" }, { letra: "asc" }],
    }),
    // Clases que dicté y aún no firmo (Circular 30: la firma certifica la clase).
    prisma.claseRegistrada.findMany({
      where: {
        colegioId,
        firmadaEn: null,
        eliminadaEn: null,
        asignatura: { docenteId: usuarioId },
      },
      select: {
        id: true,
        fecha: true,
        asignatura: {
          select: { nombre: true, curso: { select: { nivel: true, letra: true } } },
        },
      },
      orderBy: { fecha: "desc" },
      take: 6,
    }),
    // Recordatorios: evaluaciones que YO aplico en los próximos 7 días.
    prisma.evaluacion.findMany({
      where: {
        colegioId,
        eliminadaEn: null,
        asignatura: { docenteId: usuarioId },
        fecha: { gte: desdeHoy, lte: hasta7 },
      },
      select: {
        nombre: true,
        tipo: true,
        fecha: true,
        asignatura: { select: { nombre: true, color: true, curso: { select: { nivel: true, letra: true } } } },
      },
      orderBy: { fecha: "asc" },
      take: 8,
    }),
  ]);

  // Asistencia agregada en la BD: evita traer todas las marcas del semestre a
  // memoria. Presente = estado ≠ AUSENTE (mismo criterio que cuentaComoPresente);
  // el denominador son los días CON registro. Un recuento por curso y día.
  const cursoIds = cursos.map((c) => c.id);
  const filasAsist = cursoIds.length
    ? await prisma.$queryRaw<{ curso: string; fecha: Date; total: bigint; presentes: bigint }[]>(Prisma.sql`
        SELECT m."cursoId" AS curso, a."fecha" AS fecha,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE a."estado" <> 'AUSENTE') AS presentes
        FROM "AsistenciaDiaria" a
        JOIN "Matricula" m ON m."estudianteId" = a."estudianteId" AND m."estado" = 'ACTIVA'
        WHERE a."colegioId" = ${colegioId} AND m."cursoId" IN (${Prisma.join(cursoIds)})
        GROUP BY m."cursoId", a."fecha"
        ORDER BY a."fecha" ASC
      `)
    : [];

  const asistPorCurso = new Map<string, { total: number; presentes: number }[]>();
  for (const f of filasAsist) {
    const arr = asistPorCurso.get(f.curso) ?? asistPorCurso.set(f.curso, []).get(f.curso)!;
    arr.push({ total: Number(f.total), presentes: Number(f.presentes) });
  }
  const redondea1 = (p: number, t: number) => (t ? Math.round((p / t) * 1000) / 10 : null);

  const cursoStats = ordenarCursos(cursos).map((c) => {
    // Asistencia del curso (ya ordenada por fecha ascendente desde la BD).
    const dias = asistPorCurso.get(c.id) ?? [];
    const totalAll = dias.reduce((s, d) => s + d.total, 0);
    const presAll = dias.reduce((s, d) => s + d.presentes, 0);
    const asistencia = redondea1(presAll, totalAll);
    const spark = dias.slice(-10).map((d) => redondea1(d.presentes, d.total) ?? 0);

    // Promedio del curso en las asignaturas que dicto.
    // Pre-índice: cada evaluación con su calificación indexada por estudiante,
    // para evitar el O(estudiantes²) de `.find` dentro del bucle (pasa a O(1)).
    const asignaturasIdx = c.asignaturas.map((a) =>
      a.evaluaciones.map((ev) => ({
        ponderacion: ev.ponderacion,
        porEst: new Map(ev.calificaciones.map((x) => [x.estudianteId, x])),
      }))
    );
    const promedios = c.matriculas
      .map((m) => {
        const finales = asignaturasIdx
          .map((evs) => {
            const items: ItemPromedio[] = evs.map((ev) => {
              const cal = ev.porEst.get(m.estudianteId);
              return {
                nota: cal?.eximida ? null : cal?.nota ?? null,
                ponderacion: ev.ponderacion,
                computa: !cal?.eximida,
              };
            });
            return calcularPromedio(items).promedio;
          })
          .filter((p): p is number => p !== null);
        return promedioGeneral(finales);
      })
      .filter((p): p is number => p !== null);

    return {
      id: c.id,
      nombre: nombreCurso(c),
      esJefatura: c.profesorJefeId === usuarioId,
      total: c.matriculas.length,
      asistencia,
      promedio: promedioGeneral(promedios),
      // La mini-tendencia solo tiene sentido con ≥2 días; con 1 punto se vería
      // como un artefacto suelto.
      spark: spark.length >= 2 ? spark : null,
    };
  });

  const totalEstudiantes = new Set(
    cursos.flatMap((c) => c.matriculas.map((m) => m.estudianteId))
  ).size;
  const promClases = cursoStats.map((c) => c.promedio).filter((p): p is number => p !== null);
  const promGeneral = promedioGeneral(promClases);

  // ── Tus clases de hoy: agenda del día según el horario (bloques de hoy) ───
  const clasesHoy = cursos
    .flatMap((c) =>
      c.asignaturas.flatMap((a) =>
        a.bloques.map((b) => ({
          cursoId: c.id,
          cursoNombre: nombreCurso(c),
          asignaturaId: a.id,
          asignaturaNombre: a.nombre,
          color: a.color,
          bloqueId: b.id,
          horaInicio: b.horaInicio,
          horaFin: b.horaFin,
        }))
      )
    )
    .sort((x, y) => x.horaInicio.localeCompare(y.horaInicio));

  // Estado de firma (por bloque) y de asistencia (por curso) del día de hoy.
  let firmaDe: (aId: string, bId: string) => "pendiente" | "registrada" | "firmada" = () => "pendiente";
  const cursoConAsistencia = new Set<string>();
  if (clasesHoy.length) {
    const cursoIdsHoy = new Set(clasesHoy.map((cl) => cl.cursoId));
    const est2curso = new Map<string, string>();
    for (const c of cursos) if (cursoIdsHoy.has(c.id)) for (const m of c.matriculas) est2curso.set(m.estudianteId, c.id);
    const idsHoy = [...est2curso.keys()];
    const fechaHoy = fechaDesdeISO(hoy);

    const [registradasHoy, asistHoy] = await Promise.all([
      prisma.claseRegistrada.findMany({
        where: {
          colegioId,
          asignaturaId: { in: [...new Set(clasesHoy.map((cl) => cl.asignaturaId))] },
          fecha: fechaHoy,
          eliminadaEn: null,
        },
        select: { asignaturaId: true, bloqueHorarioId: true, firmadaEn: true },
      }),
      idsHoy.length
        ? prisma.asistenciaDiaria.findMany({
            where: { colegioId, fecha: fechaHoy, estudianteId: { in: idsHoy } },
            select: { estudianteId: true },
          })
        : Promise.resolve([] as { estudianteId: string }[]),
    ]);

    firmaDe = (aId, bId) => {
      const r = registradasHoy.find((x) => x.asignaturaId === aId && x.bloqueHorarioId === bId);
      if (!r) return "pendiente";
      return r.firmadaEn ? "firmada" : "registrada";
    };
    for (const a of asistHoy) {
      const cid = est2curso.get(a.estudianteId);
      if (cid) cursoConAsistencia.add(cid);
    }
  }
  const totalHoy = clasesHoy.length;
  const firmadasHoy = clasesHoy.filter((cl) => firmaDe(cl.asignaturaId, cl.bloqueId) === "firmada").length;
  const diaCompleto = totalHoy > 0 && firmadasHoy === totalHoy;

  const anio = hoy.slice(0, 4);
  const semestre = Number(hoy.slice(5, 7)) <= 7 ? "1er semestre" : "2º semestre";
  const fmt1 = (n: number | null) => (n === null ? "—" : n.toFixed(1));

  // Los accesos rápidos viven ahora SOLO arriba (componente AccesosRapidos),
  // para no duplicar la misma información dos veces en el inicio.

  return (
    <div className="animar-surgir">
      <header className="encabezado-cine malla-academica estrellas relative overflow-hidden rounded-2xl px-6 py-7 shadow-elevada sm:px-9 sm:py-9">
        <span className="aurora-luz aurora-luz-1" aria-hidden />
        <span className="aurora-luz aurora-luz-2" aria-hidden />
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-acento/70 to-transparent"
          aria-hidden
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Año escolar {anio} · {semestre}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Hola, {nombre?.split(" ")[0] ?? ""}
            </h1>
            <p className="mt-1.5 text-sm text-white/75">
              Tus cursos y pendientes de hoy · {colegioNombre}
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-right backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-wider text-white/60">Hoy</p>
            <p className="mt-0.5 text-sm font-semibold capitalize text-white">
              {formatearFechaLarga(hoy)}
            </p>
          </div>
        </div>
      </header>

      {/* Accesos rápidos: las acciones de todos los días, a un toque */}
      <AccesosRapidos rol={rol} />

      {/* Radar Aulia: insights automáticos con salto directo a Auli */}
      <InsightsAulia usuarioId={usuarioId} rol={rol} colegioId={colegioId} />

      {/*
        Tus clases de hoy — la jornada del profesor (prioridad de la profesora:
        ver solo lo que le toca hoy y actuar en un toque).

        Cuando no hay clases, la sección NO se omite: se muestra vacía y con
        explicación. Omitirla dejaba al profesor de asignatura sin agenda y sin
        ninguna pista de por qué, que se lee como plataforma rota y no como
        "hoy no te toca".
      */}
      {clasesHoy.length === 0 ? (
        <section className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">Tus clases de hoy</h2>
            <span className="text-sm capitalize text-tinta-tenue">{DIA_LARGO[diaHoy]}</span>
          </div>
          <div className="superficie mt-3 rounded-xl px-5 py-8 text-center">
            <p className="font-medium text-tinta">Hoy no tienes clases en tu horario.</p>
            <p className="mt-1 text-sm text-tinta-suave">
              Si esperabas tener clases hoy, revisa tu horario: puede que el bloque no
              esté publicado en la versión vigente.
            </p>
            <Link
              href="/libro-clases/horario"
              className="btn btn-secundario mt-4 inline-flex"
            >
              Ver mi horario
            </Link>
          </div>
        </section>
      ) : (
        <section className="surgir-secuencia mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">Tus clases de hoy</h2>
            <div className="flex items-center gap-2.5">
              {diaCompleto ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-exito-suave px-2.5 py-1 text-xs font-semibold text-exito">
                  <CheckMini /> Día completo
                </span>
              ) : (
                <span className="text-xs font-medium tabular-nums text-tinta-tenue">
                  {firmadasHoy} de {totalHoy} firmadas
                </span>
              )}
              <span className="text-sm capitalize text-tinta-tenue">{DIA_LARGO[diaHoy]}</span>
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {clasesHoy.map((cl) => {
              const estado = firmaDe(cl.asignaturaId, cl.bloqueId);
              const asisOk = cursoConAsistencia.has(cl.cursoId);
              return (
                <li
                  key={cl.bloqueId}
                  className="superficie flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl p-3.5 sm:p-4"
                >
                  <span className="flex shrink-0 flex-col items-center rounded-lg bg-superficie-3 px-3 py-1.5 text-xs font-semibold tabular-nums text-tinta-suave">
                    <span>{cl.horaInicio}</span>
                    <span className="text-[11px] font-normal text-tinta-tenue">{cl.horaFin}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-tinta">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorAsignatura(cl.asignaturaNombre, cl.color).punto}`}
                        aria-hidden
                      />
                      {cl.asignaturaNombre}
                    </p>
                    <p className="text-xs text-tinta-tenue">{cl.cursoNombre}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {asisOk ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-exito-suave px-2.5 py-1.5 text-xs font-semibold text-exito">
                        <CheckMini /> Asistencia
                      </span>
                    ) : (
                      <Link
                        href={`/libro-clases/asistencia?cursoId=${cl.cursoId}`}
                        className="inline-flex items-center rounded-lg bg-superficie-3 px-2.5 py-1.5 text-xs font-semibold text-tinta-suave transition-colors hover:bg-marca-50 hover:text-marca-700"
                      >
                        Tomar asistencia
                      </Link>
                    )}
                    {estado === "firmada" ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-exito-suave px-2.5 py-1.5 text-xs font-semibold text-exito">
                        <CheckMini /> Firmada
                      </span>
                    ) : (
                      <Link
                        href={`/libro-clases/firma?asignaturaId=${cl.asignaturaId}`}
                        className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          estado === "registrada"
                            ? "bg-alerta-suave text-alerta hover:brightness-95"
                            : "bg-marca-600 text-white hover:bg-marca-700"
                        }`}
                      >
                        {estado === "registrada" ? "Firmar clase" : "Leccionario"}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Indicadores clave — "Por firmar" domina cuando hay pendientes (accionable) */}
      <section className="surgir-secuencia mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaKPI
          titulo="Por firmar"
          valor={sinFirmar.length}
          contexto={sinFirmar.length ? "clases pendientes hoy" : "todo al día"}
          icono="firma"
          tono={sinFirmar.length ? "alerta" : "neutro"}
          destacado
          className="col-span-2"
          href="/libro-clases/firma"
        />
        <TarjetaKPI titulo="Mis cursos" valor={cursos.length} contexto="a tu cargo" icono="cursos" />
        <TarjetaKPI titulo="Estudiantes" valor={totalEstudiantes} contexto="en tus cursos" icono="estudiantes" />
      </section>

      {/* Contexto secundario: promedio general de tus asignaturas */}
      <section className="mt-3 grid grid-cols-2 divide-x divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
        <div className="px-4 py-3 text-center">
          <p className={`cifra text-xl ${promGeneral !== null && promGeneral < NOTA_APROBACION ? "text-peligro" : "text-tinta"}`}>
            {fmt1(promGeneral)}
          </p>
          <p className="mt-0.5 text-xs text-tinta-tenue">Promedio de mis asignaturas</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="cifra text-xl text-tinta">{semestre}</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">Año escolar {anio}</p>
        </div>
      </section>

      {/* Recordatorios · esta semana: próximas evaluaciones que aplica el profesor */}
      {evalsProximas.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">Recordatorios · esta semana</h2>
            <Link href="/calendario" className="text-xs font-medium text-marca-600 hover:text-marca-700">Ver calendario →</Link>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {evalsProximas.map((ev, i) => {
              const dias = Math.round((fechaDesdeISO(isoDesdeFecha(ev.fecha)).getTime() - desdeHoy.getTime()) / 86400000);
              const cuando = dias <= 0 ? "Hoy" : dias === 1 ? "Mañana" : `En ${dias} días`;
              return (
                <li key={i} className="superficie flex items-center gap-3 rounded-xl p-3.5">
                  <span className="flex shrink-0 flex-col items-center rounded-lg bg-superficie-3 px-3 py-1.5 text-center">
                    <span className="text-[11px] font-semibold uppercase text-marca-600">{cuando}</span>
                    <span className="text-[11px] text-tinta-tenue">{fmtDia(ev.fecha)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-tinta">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorAsignatura(ev.asignatura.nombre, ev.asignatura.color).punto}`} aria-hidden />
                      {ev.nombre}
                    </p>
                    <p className="truncate text-xs text-tinta-tenue">
                      {ev.asignatura.nombre} · {ev.asignatura.curso.nivel} {ev.asignatura.curso.letra} · {ev.tipo === "FORMATIVA" ? "Formativa" : "Sumativa"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Mis cursos con sparkline de asistencia */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">Mis cursos</h2>
          <Link href="/libro-clases/asistencia" className="text-xs font-medium text-marca-600 hover:text-marca-700">
            Ir al libro →
          </Link>
        </div>
        {cursoStats.length === 0 ? (
          <p className="superficie mt-3 rounded-xl px-5 py-8 text-center text-sm text-tinta-suave">
            Aún no tienes cursos asignados. La dirección los configura en Administración.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cursoStats.map((c) => (
              <Link
                key={c.id}
                href={`/libro-clases/asistencia?cursoId=${c.id}`}
                className="superficie tarjeta-int flex flex-col rounded-xl p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-semibold tracking-tight text-tinta">{c.nombre}</p>
                  {c.esJefatura && <Insignia tono="marca">Jefatura</Insignia>}
                </div>
                <p className="mt-0.5 text-xs text-tinta-tenue">{c.total} estudiantes</p>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-tinta-tenue">Asistencia</p>
                    <p className="font-display text-xl font-bold tabular-nums text-tinta">
                      {c.asistencia === null ? "—" : `${c.asistencia}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-tinta-tenue">Promedio</p>
                    <p className={`font-display text-xl font-bold tabular-nums ${c.promedio !== null && c.promedio < NOTA_APROBACION ? "text-peligro" : "text-tinta"}`}>
                      {fmt1(c.promedio)}
                    </p>
                  </div>
                </div>

                {c.spark && (
                  <div className="mt-3 -mb-1">
                    <Sparkline datos={c.spark} alto={34} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Pendientes: clases por firmar */}
      <section className="mt-8">
        <div className="superficie rounded-xl p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-base font-semibold tracking-tight">Clases por firmar</h2>
            {sinFirmar.length > 0 && (
              <Link href="/libro-clases/firma" className="text-xs font-medium text-marca-600 hover:text-marca-700">
                Firmar →
              </Link>
            )}
          </div>
          {sinFirmar.length === 0 ? (
            <div className="mt-3 flex flex-col items-center justify-center gap-1.5 py-8 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-exito-suave text-exito">✓</span>
              <p className="text-sm text-tinta-suave">Todo firmado. Sin pendientes.</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {sinFirmar.map((cl) => (
                <li key={cl.id} className="flex items-center gap-3 rounded-lg bg-superficie-2 px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alerta-suave text-alerta">
                    <Iconos.firma className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-tinta">
                      {cl.asignatura.nombre} · {cl.asignatura.curso.nivel} {cl.asignatura.curso.letra}
                    </p>
                    <p className="text-xs text-tinta-tenue">{fmtDia(cl.fecha)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

      </section>
    </div>
  );
}
