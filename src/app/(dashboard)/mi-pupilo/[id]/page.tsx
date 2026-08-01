import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { calcularResumen, UMBRAL_ASISTENCIA, type EstadoAsistencia } from "@/lib/asistencia";
import {
  calcularPromedio,
  promedioGeneral,
  NOTA_APROBACION,
  type ItemPromedio,
} from "@/lib/calificaciones";
import Link from "next/link";
import { Medidor } from "@/components/ui/viz";
import { Avatar } from "@/components/ui/avatar";
import { hoyEnSantiago, isoDesdeFecha, formatearFechaLarga } from "@/lib/fecha";
import { Justificaciones, type Inasistencia } from "./justificar-cliente";
import { HiloMensajes } from "@/components/mensajes/hilo";
import { descifrarFundamentoJustificacion, descifrarMotivoJustificacion } from "@/lib/cifrado-justificacion";
import { nombreCurso } from "@/lib/cursos";

const fmtDia = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(d)
    : "";

const TIPO_ANOT: Record<string, { label: string; cls: string }> = {
  POSITIVA: { label: "Positiva", cls: "bg-exito-suave text-exito" },
  NEGATIVA: { label: "Negativa", cls: "bg-peligro-suave text-peligro" },
  NEUTRA: { label: "Registro", cls: "bg-superficie-3 text-tinta-suave" },
};

const colorNota = (n: number) =>
  n >= NOTA_APROBACION ? "text-exito" : "text-peligro";

export default async function MiPupiloPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requerirSesion();
  const { id } = await params;

  // Autorización: el estudiante debe ser pupilo del apoderado en sesión.
  const estudiante = await prisma.estudiante.findFirst({
    where: {
      id,
      colegioId: user.colegioId,
      apoderados: { some: { usuarioId: user.id } },
    },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: {
          curso: {
            select: { id: true, nivel: true, letra: true, profesorJefe: { select: { nombre: true } } },
          },
        },
        take: 1,
      },
    },
  });
  if (!estudiante) notFound();

  const curso = estudiante.matriculas[0]?.curso ?? null;

  const [asistencias, ausentes, justificaciones, mensajes, asignaturas, anotaciones, comunicados] = await Promise.all([
    prisma.asistenciaDiaria.findMany({
      where: { colegioId: user.colegioId, estudianteId: id },
      select: { estado: true },
    }),
    // Inasistencias recientes (para justificar).
    prisma.asistenciaDiaria.findMany({
      where: { colegioId: user.colegioId, estudianteId: id, estado: "AUSENTE" },
      select: { id: true, fecha: true },
      orderBy: { fecha: "desc" },
      take: 12,
    }),
    prisma.justificacionInasistencia.findMany({
      where: { colegioId: user.colegioId, estudianteId: id },
      select: { asistenciaDiariaId: true, fecha: true, motivo: true, estado: true, fundamentoRevision: true },
    }),
    prisma.mensajeDirecto.findMany({
      where: { colegioId: user.colegioId, estudianteId: id },
      orderBy: { creadoEn: "asc" },
      take: 100,
      select: { id: true, deApoderado: true, cuerpo: true, creadoEn: true },
    }),
    curso
      ? prisma.asignatura.findMany({
          where: { cursoId: curso.id, colegioId: user.colegioId },
          select: {
            nombre: true,
            evaluaciones: {
              where: { eliminadaEn: null },
              orderBy: { fecha: "asc" },
              select: {
                nombre: true,
                tipo: true,
                ponderacion: true,
                fecha: true,
                contenidos: true,
                calificaciones: {
                  where: { estudianteId: id, eliminadaEn: null },
                  select: { nota: true, eximida: true },
                },
              },
            },
          },
          orderBy: { nombre: "asc" },
        })
      : Promise.resolve([]),
    prisma.anotacion.findMany({
      where: { colegioId: user.colegioId, estudianteId: id, eliminadaEn: null },
      orderBy: { creadaEn: "desc" },
      select: { id: true, tipo: true, categoria: true, texto: true, fechaHecho: true, creadaEn: true },
      take: 30,
    }),
    prisma.comunicadoDestinatario.findMany({
      where: {
        apoderadoUsuarioId: user.id,
        colegioId: user.colegioId,
        comunicado: { eliminadoEn: null },
      },
      orderBy: { comunicado: { creadoEn: "desc" } },
      take: 3,
      select: { leidoEn: true, comunicado: { select: { id: true, titulo: true, creadoEn: true } } },
    }),
  ]);

  // Próximas evaluaciones (calendario): evaluaciones con fecha desde hoy y sin nota.
  const hoy = hoyEnSantiago();
  const proximas = asignaturas
    .flatMap((a) =>
      a.evaluaciones
        .filter((e) => isoDesdeFecha(e.fecha) >= hoy && !e.calificaciones[0])
        .map((e) => ({ asignatura: a.nombre, nombre: e.nombre, fecha: e.fecha, contenidos: e.contenidos }))
    )
    .sort((x, y) => x.fecha.getTime() - y.fecha.getTime())
    .slice(0, 6);
  const sinLeer = comunicados.filter((c) => !c.leidoEn).length;

  const resumen = calcularResumen(asistencias.map((a) => a.estado as EstadoAsistencia));

  // Inasistencias recientes con su estado de justificación.
  const justPorAsistencia = new Map(
    justificaciones.filter((j) => j.asistenciaDiariaId).map((j) => [j.asistenciaDiariaId, j])
  );
  // Fallback para justificaciones creadas antes de existir asistenciaDiariaId.
  const justPorFecha = new Map(justificaciones.map((j) => [isoDesdeFecha(j.fecha), j]));
  const inasistencias: Inasistencia[] = ausentes.map((a) => {
    const iso = isoDesdeFecha(a.fecha);
    const justificacion = justPorAsistencia.get(a.id) ?? justPorFecha.get(iso);
    return {
      iso,
      fechaLarga: formatearFechaLarga(iso),
      estado: justificacion?.estado ?? null,
      motivo: justificacion ? descifrarMotivoJustificacion(justificacion.motivo) : null,
      fundamentoRevision: descifrarFundamentoJustificacion(justificacion?.fundamentoRevision ?? null),
    };
  });

  // Promedio por asignatura (solo sumativas ponderan) y promedio general.
  const porAsignatura = asignaturas.map((a) => {
    const items: ItemPromedio[] = a.evaluaciones
      .filter((e) => e.tipo === "SUMATIVA")
      .map((e) => {
        const cal = e.calificaciones[0];
        return {
          nota: cal?.eximida ? null : cal?.nota ?? null,
          ponderacion: e.ponderacion,
          computa: !cal?.eximida,
        };
      });
    const promedio = calcularPromedio(items).promedio;
    return { nombre: a.nombre, promedio, evaluaciones: a.evaluaciones };
  });
  const general = promedioGeneral(
    porAsignatura.map((a) => a.promedio).filter((p): p is number => p !== null)
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard" className="text-xs text-tinta-tenue hover:text-tinta-suave">
        ← Volver
      </Link>
      {/* Héroe cinematográfico: el estudiante como protagonista */}
      <header className="encabezado-cine malla-academica estrellas relative mt-2 mb-5 overflow-hidden rounded-2xl px-6 py-6 shadow-elevada sm:px-8">
        <span className="aurora-luz aurora-luz-1" aria-hidden />
        <span className="aurora-luz aurora-luz-2" aria-hidden />
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-acento/70 to-transparent"
          aria-hidden
        />
        <div className="relative z-10 flex items-center gap-4">
          <Avatar
            nombres={estudiante.nombres}
            apellidos={estudiante.apellidos}
            tamano="lg"
            className="shadow-elevada ring-2 ring-white/30"
          />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {estudiante.nombres} {estudiante.apellidos}
            </h1>
            <p className="mt-0.5 text-sm text-white/75">
              {curso ? nombreCurso(curso) : "Sin curso activo"}
              {curso?.profesorJefe?.nombre ? ` · Prof. jefe: ${curso.profesorJefe.nombre}` : ""}
            </p>
          </div>
        </div>
      </header>

      {/* Resumen: asistencia + promedio general */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="superficie tarjeta-heroe flex items-center justify-center rounded-xl p-5">
          <Medidor valor={resumen.porcentaje} etiqueta="Asistencia" umbral={UMBRAL_ASISTENCIA} />
        </div>
        <div className="superficie tarjeta-heroe flex flex-col justify-center rounded-xl p-5 sm:col-span-2">
          <p className="text-xs font-bold uppercase tracking-widest text-marca-600">Promedio general</p>
          <p className={`mt-1 font-display text-4xl font-bold tabular-nums ${general !== null ? colorNota(general) : "text-tinta"}`}>
            {general !== null ? general.toFixed(1) : "—"}
          </p>
          <p className="mt-1 text-xs text-tinta-tenue">
            Promedio de las asignaturas con notas registradas. Escala 1.0–7.0, aprobación {NOTA_APROBACION.toFixed(1)}.
          </p>
        </div>
      </div>

      {/* Línea de tiempo: notas, ausencias y anotaciones en un solo feed */}
      {(() => {
        type Evento =
          | { tipo: "nota"; fecha: Date; asignatura: string; evaluacion: string; nota: number | null; eximida: boolean }
          | { tipo: "ausencia"; fecha: Date }
          | { tipo: "anotacion"; fecha: Date; positiva: boolean; categoria: string | null };

        const eventos: Evento[] = [
          ...asignaturas.flatMap((a) =>
            a.evaluaciones
              .filter((e) => e.calificaciones[0])
              .map((e) => ({
                tipo: "nota" as const,
                fecha: e.fecha,
                asignatura: a.nombre,
                evaluacion: e.nombre,
                nota: e.calificaciones[0].eximida ? null : e.calificaciones[0].nota,
                eximida: e.calificaciones[0].eximida,
              }))
          ),
          ...ausentes.map((x) => ({ tipo: "ausencia" as const, fecha: x.fecha })),
          ...anotaciones.map((an) => ({
            tipo: "anotacion" as const,
            fecha: an.fechaHecho ?? an.creadaEn,
            positiva: an.tipo === "POSITIVA",
            categoria: an.categoria,
          })),
        ]
          .sort((x, y) => y.fecha.getTime() - x.fecha.getTime())
          .slice(0, 12);

        if (eventos.length === 0) return null;
        return (
          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold tracking-tight">Línea de tiempo</h2>
            <p className="mt-0.5 text-xs text-tinta-tenue">
              Lo más reciente de {estudiante.nombres.split(" ")[0]}: notas, asistencia y hoja de vida.
            </p>
            <ol className="mt-3 space-y-0 border-l-2 border-borde pl-5">
              {eventos.map((ev, i) => (
                <li key={i} className="relative pb-4 last:pb-0">
                  <span
                    className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-lienzo ${
                      ev.tipo === "nota"
                        ? ev.eximida || ev.nota === null || ev.nota >= NOTA_APROBACION
                          ? "bg-marca-500"
                          : "bg-peligro"
                        : ev.tipo === "ausencia"
                          ? "bg-peligro"
                          : ev.positiva
                            ? "bg-exito"
                            : "bg-alerta"
                    }`}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs tabular-nums text-tinta-tenue">{fmtDia(ev.fecha)}</span>
                    {ev.tipo === "nota" && (
                      <>
                        <span className="text-sm font-medium text-tinta">
                          {ev.asignatura} · {ev.evaluacion}
                        </span>
                        {ev.eximida ? (
                          <span className="rounded-md bg-superficie-3 px-1.5 py-0.5 text-xs font-semibold text-tinta-suave">
                            Eximido
                          </span>
                        ) : ev.nota !== null ? (
                          <span className={`font-display text-sm font-bold tabular-nums ${colorNota(ev.nota)}`}>
                            {ev.nota.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-tinta-tenue">sin nota aún</span>
                        )}
                      </>
                    )}
                    {ev.tipo === "ausencia" && (
                      <span className="text-sm font-medium text-tinta">
                        Ausencia registrada
                      </span>
                    )}
                    {ev.tipo === "anotacion" && (
                      <span className="text-sm font-medium text-tinta">
                        Anotación {ev.positiva ? "positiva" : "negativa"}
                        {ev.categoria ? ` · ${ev.categoria}` : ""}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })()}

      {/* Mensajes con el profesor jefe */}
      <section id="mensajes" className="mt-8 scroll-mt-20">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Mandar mensaje a profesor(a) jefe {curso?.profesorJefe?.nombre ?? ""}
        </h2>
        <HiloMensajes
          estudianteId={estudiante.id}
          soyApoderado
          contraparte={curso?.profesorJefe?.nombre?.split(" ")[0] ?? "el profesor"}
          mensajes={mensajes.map((m) => ({
            id: m.id,
            deApoderado: m.deApoderado,
            cuerpo: m.cuerpo,
            creadoEn: m.creadoEn.toISOString(),
          }))}
        />
      </section>

      {/* Inasistencias: el apoderado puede justificar */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold tracking-tight">Inasistencias</h2>
        <p className="mt-0.5 text-xs text-tinta-tenue">
          Envía los antecedentes de una inasistencia y consulta aquí la respuesta de Inspectoría.
        </p>
        <Justificaciones estudianteId={estudiante.id} inasistencias={inasistencias} />
      </section>

      {/* Próximas evaluaciones (calendario) */}
      {proximas.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold tracking-tight">Próximas evaluaciones</h2>
          <ul className="mt-3 space-y-2">
            {proximas.map((p, i) => (
              <li key={i} className="superficie tarjeta-int flex items-center gap-3 rounded-xl p-4">
                <div className="chip-gradiente flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg">
                  <span className="text-[10px] font-semibold uppercase leading-none">
                    {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "short" }).format(p.fecha)}
                  </span>
                  <span className="font-display text-lg font-bold leading-none">
                    {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric" }).format(p.fecha)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">{p.nombre}</p>
                  <p className="text-xs text-tinta-tenue">{p.asignatura}</p>
                  {p.contenidos ? (
                    <p className="mt-1 text-xs leading-snug text-tinta-suave">
                      <span className="font-semibold text-tinta-tenue">Qué entra:</span> {p.contenidos}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Comunicados del colegio */}
      {comunicados.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">Comunicados</h2>
            <Link href="/comunicacion" className="text-xs font-medium text-marca-600 hover:text-marca-700">
              Ver todos{sinLeer > 0 ? ` (${sinLeer} sin leer)` : ""} →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {comunicados.map((c) => (
              <li key={c.comunicado.id}>
                <Link
                  href="/comunicacion"
                  className="superficie tarjeta-int flex items-center justify-between gap-3 rounded-xl p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-tinta">{c.comunicado.titulo}</p>
                    <p className="text-xs text-tinta-tenue">{fmtDia(c.comunicado.creadoEn)}</p>
                  </div>
                  {!c.leidoEn && (
                    <span className="shrink-0 rounded-md bg-marca-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                      Nuevo
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Calificaciones por asignatura */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold tracking-tight">Calificaciones</h2>
        {porAsignatura.length === 0 ? (
          <p className="superficie mt-3 rounded-xl px-5 py-6 text-sm text-tinta-suave">
            Aún no hay asignaturas con evaluaciones.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {porAsignatura.map((a) => (
              <details key={a.nombre} className="superficie overflow-hidden rounded-xl">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                  <span className="font-medium text-tinta">{a.nombre}</span>
                  <span className={`font-display text-lg font-bold tabular-nums ${a.promedio !== null ? colorNota(a.promedio) : "text-tinta-tenue"}`}>
                    {a.promedio !== null ? a.promedio.toFixed(1) : "—"}
                  </span>
                </summary>
                <ul className="border-t border-borde">
                  {a.evaluaciones.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-tinta-tenue">Sin evaluaciones.</li>
                  ) : (
                    a.evaluaciones.map((e, i) => {
                      const cal = e.calificaciones[0];
                      return (
                        <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            <span className="text-tinta">{e.nombre}</span>
                            <span className="ml-2 text-xs text-tinta-tenue">{fmtDia(e.fecha)}</span>
                          </div>
                          {cal?.eximida ? (
                            <span className="rounded-md bg-superficie-3 px-2 py-0.5 text-xs font-semibold text-tinta-suave">Eximido</span>
                          ) : cal?.nota != null ? (
                            <span className={`font-semibold tabular-nums ${colorNota(cal.nota)}`}>{cal.nota.toFixed(1)}</span>
                          ) : (
                            <span className="text-xs text-tinta-tenue">Sin nota</span>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Hoja de vida (anotaciones) */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold tracking-tight">Hoja de vida</h2>
        {anotaciones.length === 0 ? (
          <p className="superficie mt-3 rounded-xl px-5 py-6 text-sm text-tinta-suave">
            No hay anotaciones registradas.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {anotaciones.map((an) => {
              const t = TIPO_ANOT[an.tipo] ?? TIPO_ANOT.NEUTRA;
              return (
                <li key={an.id} className="superficie rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${t.cls}`}>
                      {t.label}
                      {an.categoria ? ` · ${an.categoria}` : ""}
                    </span>
                    <span className="text-xs text-tinta-tenue">
                      {fmtDia(an.fechaHecho ?? an.creadaEn)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-tinta">{an.texto}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
