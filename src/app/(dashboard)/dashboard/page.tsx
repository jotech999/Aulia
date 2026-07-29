import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { formatearFechaLarga, hoyEnSantiago, fechaDesdeISO } from "@/lib/fecha";
import { Iconos } from "@/components/ui/iconos";
import { NOTA_APROBACION } from "@/lib/calificaciones";
import { ESTILO_EVENTO, type TipoEventoVista } from "@/lib/calendario";
import { PanelDireccion } from "./panel-direccion";
import { PanelProfesor } from "./panel-profesor";
import { PanelEstudiante } from "./panel-estudiante";
import { PanelInspector } from "./panel-inspector";
import { ActivarNotificaciones } from "@/components/pwa/activar-notificaciones";
import { InstalarApp } from "@/components/pwa/instalar-app";
import { nombreCurso } from "@/lib/cursos";

export default async function DashboardPage() {
  const sesion = await requerirSesion();
  const colegioId = sesion.user.colegioId;

  // El sostenedor no opera un colegio: su inicio es el panel comparativo de su red.
  if (sesion.user.rol === "SOSTENEDOR") {
    redirect("/sostenedor");
  }

  if (sesion.user.rol === "ESTUDIANTE") {
    return <PanelEstudiante usuarioId={sesion.user.id} colegioId={colegioId} nombre={sesion.user.name} />;
  }

  // El apoderado tiene su propio panel: sus pupilos y las novedades (evaluaciones
  // recién publicadas), para no depender de que el profesor le avise (Lirmi no
  // notifica automáticamente; nosotros sí lo mostramos en la app).
  if (sesion.user.rol === "APODERADO") {
    return <PanelApoderado usuarioId={sesion.user.id} colegioId={colegioId} nombre={sesion.user.name} />;
  }

  // El equipo PIE tiene su propio panel acotado (fichas de apoyo recientes).
  if (sesion.user.rol === "PIE") {
    return <PanelPie colegioId={colegioId} nombre={sesion.user.name} />;
  }

  if (sesion.user.rol === "INSPECTOR") {
    return <PanelInspector colegioId={colegioId} nombre={sesion.user.name} colegioNombre={sesion.user.colegioNombre} />;
  }

  // Dirección / UTP / inspectoría: visión del colegio con gráficos.
  if (["ADMIN", "DIRECTOR", "UTP"].includes(sesion.user.rol)) {
    return (
      <PanelDireccion
        colegioId={colegioId}
        nombre={sesion.user.name}
        colegioNombre={sesion.user.colegioNombre}
      />
    );
  }

  // Profesor / profesor jefe (y cualquier otro rol del staff): sus cursos,
  // pendientes del día y sparklines.
  return (
    <PanelProfesor
      usuarioId={sesion.user.id}
      colegioId={colegioId}
      rol={sesion.user.rol}
      nombre={sesion.user.name}
      colegioNombre={sesion.user.colegioNombre}
    />
  );
}

// ── Panel del apoderado ─────────────────────────────────────────────────────
// Muestra a sus pupilos y un feed de novedades (evaluaciones recientes con su
// nota si ya fue publicada). Solo datos de sus propios pupilos (Ley 21.719).

const fmtDia = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(d);

async function PanelApoderado({
  usuarioId,
  colegioId,
  nombre,
}: {
  usuarioId: string;
  colegioId: string;
  nombre?: string | null;
}) {
  const pupilos = await prisma.estudiante.findMany({
    where: { colegioId, apoderados: { some: { usuarioId } } },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { curso: { select: { id: true, nivel: true, letra: true } } },
        take: 1,
      },
    },
    orderBy: { apellidos: "asc" },
  });

  const pupiloIds = pupilos.map((p) => p.id);
  const cursoPorPupilo = new Map(
    pupilos.map((p) => [p.id, p.matriculas[0]?.curso ?? null])
  );
  const cursoIds = [...new Set(pupilos.map((p) => p.matriculas[0]?.curso.id).filter(Boolean))] as string[];

  // Evaluaciones recientes de los cursos de sus pupilos, con la nota del pupilo.
  const evaluaciones = cursoIds.length
    ? await prisma.evaluacion.findMany({
        where: { colegioId, eliminadaEn: null, asignatura: { cursoId: { in: cursoIds } } },
        select: {
          id: true,
          nombre: true,
          fecha: true,
          asignatura: { select: { nombre: true, cursoId: true } },
          calificaciones: {
            where: { estudianteId: { in: pupiloIds }, eliminadaEn: null },
            select: { estudianteId: true, nota: true, eximida: true },
          },
        },
        orderBy: { creadaEn: "desc" },
        take: 25,
      })
    : [];

  // Próximas evaluaciones (fecha futura): lo que un apoderado más quiere saber.
  const hoyISO = hoyEnSantiago();
  const proximas = (
    cursoIds.length
      ? await prisma.evaluacion.findMany({
          where: {
            colegioId,
            eliminadaEn: null,
            asignatura: { cursoId: { in: cursoIds } },
            fecha: { gte: fechaDesdeISO(hoyISO) },
          },
          select: {
            id: true,
            nombre: true,
            fecha: true,
            asignatura: { select: { nombre: true, cursoId: true } },
          },
          orderBy: { fecha: "asc" },
          take: 5,
        })
      : []
  ).flatMap((ev) => {
    const pupilo = pupilos.find((p) => p.matriculas[0]?.curso.id === ev.asignatura.cursoId);
    if (!pupilo) return [];
    const dias = Math.round(
      (ev.fecha.getTime() - fechaDesdeISO(hoyISO).getTime()) / 86_400_000
    );
    return [{
      clave: `${ev.id}-${pupilo.id}`,
      pupilo: pupilo.nombres.split(" ")[0],
      asignatura: ev.asignatura.nombre,
      evaluacion: ev.nombre,
      fecha: ev.fecha,
      dias,
    }];
  });

  // Próximos eventos del colegio (colegio-wide + cursos de sus pupilos).
  const eventos = cursoIds.length || pupiloIds.length
    ? await prisma.eventoEscolar.findMany({
        where: {
          colegioId,
          eliminadaEn: null,
          fecha: { gte: fechaDesdeISO(hoyISO) },
          OR: [{ cursoId: null }, { cursoId: { in: cursoIds } }],
        },
        select: { titulo: true, fecha: true, tipo: true },
        orderBy: { fecha: "asc" },
        take: 3,
      })
    : [];

  const novedades = evaluaciones
    .flatMap((ev) =>
      pupilos
        .filter((p) => p.matriculas[0]?.curso.id === ev.asignatura.cursoId)
        .map((p) => {
          const cal = ev.calificaciones.find((c) => c.estudianteId === p.id);
          return {
            clave: `${ev.id}-${p.id}`,
            pupilo: p.nombres.split(" ")[0],
            asignatura: ev.asignatura.nombre,
            evaluacion: ev.nombre,
            fecha: ev.fecha,
            nota: cal?.eximida ? null : cal?.nota ?? null,
            eximido: cal?.eximida ?? false,
            publicada: Boolean(cal),
          };
        })
    )
    .slice(0, 8);

  const fechaHoy = formatearFechaLarga(hoyEnSantiago());

  return (
    <div className="animar-surgir">
      <header className="encabezado-cine malla-academica relative rounded-2xl px-6 py-7 shadow-elevada sm:px-8">
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-acento/70 to-transparent" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{fechaHoy}</p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Hola{nombre ? `, ${nombre.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-white/75">
          Aquí ves las novedades de {pupilos.length === 1 ? "tu pupilo" : "tus pupilos"}.
        </p>
      </header>

      {/* Instalación de la app + activación de notificaciones push (PWA) */}
      <InstalarApp />
      <div className="mt-5">
        <ActivarNotificaciones />
      </div>

      {/* Pupilos */}
      <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {pupilos.map((p) => {
          const curso = cursoPorPupilo.get(p.id);
          return (
            <Link
              key={p.id}
              href={`/mi-pupilo/${p.id}`}
              className="superficie tarjeta-int flex items-center gap-3 rounded-xl p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-100 text-sm font-semibold text-marca-700">
                {p.nombres[0]}
                {p.apellidos[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-tinta">
                  {p.nombres} {p.apellidos}
                </p>
                <p className="text-xs text-tinta-tenue">
                  {curso ? nombreCurso(curso) : "Sin curso activo"}
                </p>
              </div>
              <span className="text-tinta-tenue" aria-hidden>→</span>
            </Link>
          );
        })}
      </section>

      {/* Próximos eventos del colegio */}
      {eventos.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">Próximos eventos</h2>
            <Link href="/calendario" className="text-xs font-medium text-marca-600 hover:text-marca-700">
              Ver calendario →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {eventos.map((e, i) => (
              <li key={i} className="superficie flex items-center gap-3 rounded-xl p-4">
                <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-superficie-3 text-tinta-suave">
                  <span className="text-sm font-bold leading-none tabular-nums">{fmtDia(e.fecha).split(" ")[0]}</span>
                  <span className="text-[10px] uppercase leading-none">{fmtDia(e.fecha).split(" ")[1]}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-tinta">{e.titulo}</p>
                  <p className="flex items-center gap-1.5 text-xs text-tinta-tenue">
                    <span className={`h-2 w-2 rounded-full ${ESTILO_EVENTO[e.tipo as TipoEventoVista].punto}`} aria-hidden />
                    {ESTILO_EVENTO[e.tipo as TipoEventoVista].etiqueta}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Próximas evaluaciones */}
      {proximas.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold tracking-tight">Próximas evaluaciones</h2>
          <ul className="mt-3 space-y-2">
            {proximas.map((p) => (
              <li key={p.clave} className="superficie flex items-center gap-3 rounded-xl p-4">
                <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-marca-50 text-marca-700">
                  <span className="text-sm font-bold leading-none tabular-nums">{fmtDia(p.fecha).split(" ")[0]}</span>
                  <span className="text-[10px] uppercase leading-none">{fmtDia(p.fecha).split(" ")[1]}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-tinta">
                    {p.asignatura} · {p.evaluacion}
                  </p>
                  <p className="text-xs text-tinta-tenue">{p.pupilo}</p>
                </div>
                <span className="shrink-0 rounded-md bg-superficie-3 px-2 py-1 text-xs font-medium text-tinta-suave">
                  {p.dias <= 0 ? "Hoy" : p.dias === 1 ? "Mañana" : `En ${p.dias} días`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Novedades: evaluaciones recientes */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">Novedades</h2>
          <Link href="/comunicacion" className="text-xs font-medium text-marca-600 hover:text-marca-700">
            Ver comunicados →
          </Link>
        </div>

        {novedades.length === 0 ? (
          <div className="superficie mt-3 rounded-xl px-5 py-8 text-center text-sm text-tinta-suave">
            Aún no hay evaluaciones recientes. Cuando el colegio publique una
            evaluación de {pupilos.length === 1 ? "tu pupilo" : "tus pupilos"}, aparecerá aquí.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {novedades.map((n) => (
              <li key={n.clave} className="superficie flex items-center gap-3 rounded-xl p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
                  <Iconos.calificaciones className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-tinta">
                    {n.asignatura} · {n.evaluacion}
                  </p>
                  <p className="text-xs text-tinta-tenue">
                    {n.pupilo} · {fmtDia(n.fecha)}
                  </p>
                </div>
                {n.eximido ? (
                  <span className="shrink-0 rounded-md bg-superficie-3 px-2 py-1 text-xs font-semibold text-tinta-suave">
                    Eximido
                  </span>
                ) : n.publicada && n.nota !== null ? (
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-sm font-bold tabular-nums ${
                      n.nota >= NOTA_APROBACION ? "bg-exito-suave text-exito" : "bg-peligro-suave text-peligro"
                    }`}
                  >
                    {n.nota.toFixed(1)}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-md bg-alerta-suave px-2 py-1 text-xs font-semibold text-alerta">
                    Sin nota
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Panel del equipo PIE ─────────────────────────────────────────────────────
// Fichas de apoyo recientes + acceso directo a los registros PIE. Confidencial.

async function PanelPie({
  colegioId,
  nombre,
}: {
  colegioId: string;
  nombre?: string | null;
}) {
  const [fichas, totalFichas, sesionesMes] = await Promise.all([
    prisma.fichaPie.findMany({
      where: { colegioId },
      orderBy: { actualizadaEn: "desc" },
      take: 6,
      select: {
        estudianteId: true,
        profesionalACargo: true,
        estudiante: {
          select: {
            nombres: true,
            apellidos: true,
            matriculas: {
              where: { estado: "ACTIVA" },
              select: { curso: { select: { nivel: true, letra: true } } },
              take: 1,
            },
          },
        },
        _count: { select: { sesiones: true } },
      },
    }),
    prisma.fichaPie.count({ where: { colegioId } }),
    prisma.sesionPie.count({ where: { colegioId } }),
  ]);

  const fechaHoy = formatearFechaLarga(hoyEnSantiago());

  return (
    <div className="animar-surgir">
      <header className="encabezado-cine malla-academica relative rounded-2xl px-6 py-7 shadow-elevada sm:px-8">
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-acento/70 to-transparent" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{fechaHoy}</p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Hola{nombre ? `, ${nombre.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-white/75">
          Programa de Integración Escolar — información confidencial de apoyo.
        </p>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { titulo: "Fichas de apoyo", valor: totalFichas, icono: Iconos.escudo },
          { titulo: "Sesiones registradas", valor: sesionesMes, icono: Iconos.calificaciones },
        ].map((ind, i) => {
          const Icono = ind.icono;
          return (
            <div key={ind.titulo} className={`superficie flex flex-col rounded-xl p-5 ${i === 0 ? "acento-superior" : ""}`}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-tinta-suave">{ind.titulo}</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
                  <Icono className="h-[18px] w-[18px]" />
                </span>
              </div>
              <p className="mt-3 font-display text-4xl font-bold tabular-nums leading-none">{ind.valor}</p>
            </div>
          );
        })}
        <Link
          href="/pie"
          className="superficie tarjeta-int flex flex-col justify-center rounded-xl p-5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
            <Iconos.candado className="h-[18px] w-[18px]" />
          </span>
          <p className="mt-3 text-sm font-semibold text-tinta">Abrir registros PIE</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">Buscar o crear una ficha</p>
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold tracking-tight">Fichas recientes</h2>
        {fichas.length === 0 ? (
          <p className="superficie mt-3 rounded-xl px-5 py-8 text-center text-sm text-tinta-suave">
            Aún no hay fichas de apoyo. Ábrelas desde “Registros PIE”.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {fichas.map((f) => (
              <li key={f.estudianteId}>
                <Link
                  href={`/pie/${f.estudianteId}`}
                  className="superficie tarjeta-int flex items-center justify-between gap-3 rounded-xl p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-tinta">
                      {f.estudiante.apellidos}, {f.estudiante.nombres}
                    </p>
                    <p className="text-xs text-tinta-tenue">
                      {f.estudiante.matriculas[0]
                        ? `${nombreCurso(f.estudiante.matriculas[0].curso)} · `
                        : ""}
                      {f._count.sesiones} {f._count.sesiones === 1 ? "sesión" : "sesiones"}
                    </p>
                  </div>
                  <span className="text-tinta-tenue" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
