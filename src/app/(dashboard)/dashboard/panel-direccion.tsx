import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { UMBRAL_ASISTENCIA } from "@/lib/asistencia";
import {
  calcularPromedio,
  promedioGeneral,
  NOTA_APROBACION,
  type ItemPromedio,
} from "@/lib/calificaciones";
import { formatearFechaLarga, hoyEnSantiago, isoDesdeFecha, fechaDesdeISO } from "@/lib/fecha";
import { Sparkline, LineaArea, BarrasProgreso } from "@/components/ui/graficos";
import { TarjetaKPI } from "@/components/ui/tarjeta-kpi";
import { AccesosRapidos } from "@/components/ui/accesos-rapidos";
import { ResumenEjecutivo } from "./resumen-ejecutivo-cliente";
import { iaDisponible } from "@/lib/ia/cliente";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";

const mesCorto = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "short" }).format(
    new Date(Date.UTC(a, m - 1, 1))
  );
};

export async function PanelDireccion({
  colegioId,
  nombre,
  colegioNombre,
}: {
  colegioId: string;
  nombre?: string | null;
  colegioNombre?: string;
}) {
  const hoy = hoyEnSantiago();

  const [estCount, docentes, asisDia, asisEst, cursos, marcasHoy] = await Promise.all([
    prisma.estudiante.count({ where: { colegioId } }),
    prisma.membresia.count({
      where: { colegioId, rol: { in: ["PROFESOR", "PROFESOR_JEFE"] } },
    }),
    // Asistencia agregada en la BD (evita traer todas las marcas a memoria):
    // conteos por día y por estudiante, separados por estado.
    prisma.asistenciaDiaria.groupBy({
      by: ["fecha", "estado"],
      where: { colegioId },
      _count: { _all: true },
    }),
    prisma.asistenciaDiaria.groupBy({
      by: ["estudianteId", "estado"],
      where: { colegioId },
      _count: { _all: true },
    }),
    prisma.curso.findMany({
      where: { colegioId },
      select: {
        nivel: true,
        letra: true,
        matriculas: {
          where: { estado: "ACTIVA" },
          select: { estudianteId: true },
        },
        asignaturas: {
          select: {
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
    // Estudiantes con alguna marca de asistencia HOY: permite detectar cursos
    // donde aún nadie pasó la lista (alerta operativa para dirección).
    prisma.asistenciaDiaria.findMany({
      where: { colegioId, fecha: fechaDesdeISO(hoyEnSantiago()) },
      select: { estudianteId: true },
      distinct: ["estudianteId"],
    }),
  ]);

  // ── Asistencia: hoy, tendencia mensual, sparkline de últimos días ──────
  // Presente = estado ≠ AUSENTE (cuentaComoPresente); denominador = días con
  // registro. Acumulamos los conteos de la BD por día, mes y estudiante.
  type Conteo = { total: number; presentes: number };
  const acumular = (m: Map<string, Conteo>, clave: string, estado: string, n: number) => {
    const c = m.get(clave) ?? { total: 0, presentes: 0 };
    c.total += n;
    if (estado !== "AUSENTE") c.presentes += n;
    m.set(clave, c);
  };
  const pct = (c?: Conteo) => (c && c.total ? Math.round((c.presentes / c.total) * 1000) / 10 : null);

  const porDia = new Map<string, Conteo>();
  const porMes = new Map<string, Conteo>();
  for (const r of asisDia) {
    const iso = isoDesdeFecha(r.fecha);
    acumular(porDia, iso, r.estado, r._count._all);
    acumular(porMes, iso.slice(0, 7), r.estado, r._count._all);
  }
  const porEstudiante = new Map<string, Conteo>();
  for (const r of asisEst) acumular(porEstudiante, r.estudianteId, r.estado, r._count._all);

  const resumenHoyPct = pct(porDia.get(hoy));
  // Ventana fija de últimos 6 meses (rellena null donde no hay datos) para que
  // el eje temporal tenga contexto aunque el año escolar recién comience.
  const [ay, am] = hoy.slice(0, 7).split("-").map(Number);
  const ultimosMeses: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(ay, am - 1 - i, 1));
    ultimosMeses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const tendencia = ultimosMeses.map((ym) => ({
    label: mesCorto(ym),
    valor: porMes.has(ym) ? pct(porMes.get(ym)!) : null,
  }));
  const mesesConDatos = tendencia.filter((t) => t.valor !== null).length;
  const sparkAsis = [...porDia.keys()]
    .sort()
    .slice(-14)
    .map((iso) => pct(porDia.get(iso)!) ?? 0);

  // Delta de asistencia: compara los dos últimos meses con datos (para la
  // sensación de "producto de analítica", no solo un número suelto).
  const conDatos = tendencia.filter((t) => t.valor !== null);
  let deltaAsis: { direccion: "sube" | "baja" | "estable"; texto: string } | undefined;
  if (conDatos.length >= 2) {
    const ultimo = conDatos[conDatos.length - 1].valor!;
    const previo = conDatos[conDatos.length - 2].valor!;
    const d = Math.round((ultimo - previo) * 10) / 10;
    deltaAsis = {
      direccion: d > 0.1 ? "sube" : d < -0.1 ? "baja" : "estable",
      texto: `${d > 0 ? "+" : ""}${d} pts vs. mes anterior`,
    };
  }

  // ── Promedios por curso + promedio colegio + promedios por estudiante ──
  const promediosPorEst = new Map<string, number>();
  const cursoStats = ordenarCursos(cursos).map((c) => {
    // Pre-índice por asignatura: cada evaluación con su calificación indexada por
    // estudiante. Evita el O(estudiantes²) de buscar la calificación con `.find`
    // dentro del bucle de estudiantes (la búsqueda pasa a ser O(1)).
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
        const g = promedioGeneral(finales);
        if (g !== null) promediosPorEst.set(m.estudianteId, g);
        return g;
      })
      .filter((p): p is number => p !== null);
    const agg = c.matriculas.reduce<Conteo>(
      (acc, m) => {
        const e = porEstudiante.get(m.estudianteId);
        if (e) {
          acc.total += e.total;
          acc.presentes += e.presentes;
        }
        return acc;
      },
      { total: 0, presentes: 0 }
    );
    return {
      nombre: nombreCurso(c),
      promedio: promedioGeneral(promedios),
      asistencia: pct(agg),
      total: c.matriculas.length,
    };
  });

  const todosProm = [...promediosPorEst.values()];
  const promedioColegio = promedioGeneral(todosProm);

  // ── Alertas: matrícula activa con baja asistencia o promedio reprobado ──
  const idsActivos = new Set(cursos.flatMap((c) => c.matriculas.map((m) => m.estudianteId)));
  const riesgoIds = new Set<string>();
  for (const id of idsActivos) {
    const pAsis = pct(porEstudiante.get(id));
    const bajaAsis = pAsis !== null && pAsis < UMBRAL_ASISTENCIA;
    const prom = promediosPorEst.get(id);
    const bajoProm = prom !== undefined && prom < NOTA_APROBACION;
    if (bajaAsis || bajoProm) riesgoIds.add(id);
  }
  const enRiesgo = riesgoIds.size;

  // Riesgo desglosado por curso (para que dirección sepa DÓNDE intervenir).
  const statsConRiesgo = cursoStats.map((cs, i) => ({
    ...cs,
    riesgo: cursos[i].matriculas.filter((m) => riesgoIds.has(m.estudianteId)).length,
  }));

  // Cursos con matrícula activa donde nadie tiene marca de asistencia hoy.
  const marcadosHoy = new Set(marcasHoy.map((m) => m.estudianteId));
  const cursosSinLista = cursos
    .filter((c) => c.matriculas.length > 0 && !c.matriculas.some((m) => marcadosHoy.has(m.estudianteId)))
    .map((c) => nombreCurso(c));

  const cursosAtencion = [...statsConRiesgo]
    .filter((c) => c.total > 0)
    .sort((a, b) => (a.asistencia ?? 100) - (b.asistencia ?? 100))
    .slice(0, 5);

  const anio = hoy.slice(0, 4);
  const semestre = Number(hoy.slice(5, 7)) <= 7 ? "1er semestre" : "2º semestre";
  const fmt1 = (n: number | null) => (n === null ? "—" : n.toFixed(1));

  return (
    <div className="animar-surgir">
      <header className="encabezado-cine malla-academica relative rounded-2xl px-6 py-7 shadow-elevada sm:px-9 sm:py-9">
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
              Visión del colegio · {colegioNombre}
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

      {/* Accesos rápidos: las gestiones de todos los días, a un toque */}
      <AccesosRapidos rol="DIRECTOR" />

      {/* Alerta operativa: cursos donde aún nadie pasó la lista hoy */}
      {cursosSinLista.length > 0 && (
        <Link
          href="/admin/asistencia-hoy"
          className="mt-3 flex items-center gap-3 rounded-xl border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm transition-colors hover:border-alerta/60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alerta/15 font-bold text-alerta" aria-hidden>
            !
          </span>
          <span className="min-w-0 flex-1 text-tinta">
            <span className="font-semibold">
              {cursosSinLista.length === 1
                ? "1 curso aún sin lista pasada hoy"
                : `${cursosSinLista.length} cursos aún sin lista pasada hoy`}
            </span>
            <span className="text-tinta-suave">
              {" — "}
              {cursosSinLista.slice(0, 6).join(", ")}
              {cursosSinLista.length > 6 ? "…" : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-alerta">Revisar →</span>
        </Link>
      )}

      {/* Indicadores clave — jerarquía: asistencia de hoy domina, dos KPI acompañan */}
      <section className="surgir-secuencia mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaKPI
          titulo="Asistencia hoy"
          valor={resumenHoyPct === null ? "—" : `${resumenHoyPct}%`}
          destacado
          tendencia={deltaAsis}
          className="col-span-2"
          pie={<Sparkline datos={sparkAsis.length ? sparkAsis : [0]} />}
        />
        <TarjetaKPI
          titulo="Promedio colegio"
          valor={fmt1(promedioColegio)}
          contexto="Escala 1.0–7.0"
          icono="calificaciones"
          valorPeligro={promedioColegio !== null && promedioColegio < NOTA_APROBACION}
        />
        <TarjetaKPI
          titulo="Alertas"
          valor={enRiesgo}
          contexto="estudiantes en riesgo"
          icono="alertas"
          tono={enRiesgo > 0 ? "peligro" : "neutro"}
          href="/alertas"
        />
      </section>

      {/* Tira de contexto (secundaria): datos de estructura, sin competir con los KPI */}
      <section className="mt-3 grid grid-cols-3 divide-x divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
        {[
          { etiqueta: "Estudiantes", valor: estCount, href: "/admin/estudiantes" },
          { etiqueta: "Docentes", valor: docentes },
          { etiqueta: "Cursos", valor: cursoStats.length, href: "/admin/cursos" },
        ].map((it) => {
          const contenido = (
            <>
              <p className="cifra text-xl text-tinta">{it.valor}</p>
              <p className="mt-0.5 text-xs text-tinta-tenue">{it.etiqueta}</p>
            </>
          );
          return it.href ? (
            <Link key={it.etiqueta} href={it.href} className="px-4 py-3 text-center transition-colors hover:bg-superficie-2">
              {contenido}
            </Link>
          ) : (
            <div key={it.etiqueta} className="px-4 py-3 text-center">
              {contenido}
            </div>
          );
        })}
      </section>

      {/* Gráficos */}
      <section className="mt-8 grid gap-3 lg:grid-cols-5">
        <div className="superficie rounded-xl p-5 lg:col-span-3">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Evolución de la asistencia
          </h2>
          <p className="mb-2 text-xs text-tinta-tenue">Promedio mensual del colegio</p>
          {mesesConDatos >= 2 ? (
            <LineaArea datos={tendencia} sufijo="%" etiqueta="Asistencia mensual del colegio" />
          ) : mesesConDatos === 1 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-12">
              <p className="font-display text-4xl font-bold tabular-nums text-tinta">
                {resumenHoyPct === null ? "—" : `${resumenHoyPct}%`}
              </p>
              <p className="text-sm text-tinta-suave">Asistencia de este mes</p>
              <p className="mt-1 text-xs text-tinta-tenue">
                La tendencia aparecerá a medida que avance el año escolar.
              </p>
            </div>
          ) : (
            <p className="py-14 text-center text-sm text-tinta-tenue">Sin datos de asistencia aún.</p>
          )}
        </div>
        <div className="superficie rounded-xl p-5 lg:col-span-2">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Promedio por curso
          </h2>
          <p className="mb-4 text-xs text-tinta-tenue">Escala 1.0–7.0</p>
          {cursoStats.some((c) => c.promedio !== null) ? (
            <BarrasProgreso
              filas={cursoStats
                .filter((c) => c.promedio !== null)
                .map((c) => ({
                  label: c.nombre,
                  valor: ((c.promedio ?? 0) / 7) * 100,
                  detalle: fmt1(c.promedio),
                }))}
            />
          ) : (
            <p className="py-6 text-center text-sm text-tinta-tenue">Aún no hay calificaciones.</p>
          )}
        </div>
      </section>

      {/* Informe ejecutivo con IA (borrador editable, datos agregados) */}
      <ResumenEjecutivo disponible={iaDisponible()} />

      {/* Cursos que requieren atención */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Cursos que requieren atención
          </h2>
          <Link href="/alertas" className="text-xs font-medium text-marca-600 hover:text-marca-700">
            Ver alertas →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cursosAtencion.map((c) => (
            <div key={c.nombre} className="superficie rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-tinta">{c.nombre}</p>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                    (c.asistencia ?? 100) < UMBRAL_ASISTENCIA
                      ? "bg-peligro-suave text-peligro"
                      : "bg-exito-suave text-exito"
                  }`}
                >
                  {c.asistencia === null ? "—" : `${c.asistencia}%`} asist.
                </span>
              </div>
              <p className="mt-1 text-xs text-tinta-tenue">
                Promedio {fmt1(c.promedio)} · {c.total} estudiantes
                {c.riesgo > 0 && (
                  <span className="font-semibold text-peligro"> · {c.riesgo} en riesgo</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
