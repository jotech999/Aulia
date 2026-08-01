import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { whereAsignaturasFirma } from "../libro-clases/firma/consultas";
import {
  construirMes,
  mesVecino,
  NOMBRE_DIA_CORTO,
  ESTILO_EVENTO,
  type TipoEventoVista,
} from "@/lib/calendario";
import { FERIADOS_CL } from "@/lib/feriados";
import { colorAsignatura } from "@/lib/colores-asignatura";
import {
  mesActualSantiago,
  hoyEnSantiago,
  rangoMes,
  formatearMesLargo,
} from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { NuevoEvento } from "./nuevo-evento";
import { AgendarDia } from "./agendar-dia";
import { BotonEliminarEvento } from "./boton-eliminar";
import { BotonEliminarPersonal } from "./boton-eliminar-personal";
import { nombreCurso } from "@/lib/cursos";

const RE_MES = /^\d{4}-\d{2}$/;
const GESTORES = new Set(["ADMIN", "DIRECTOR", "UTP"]);
const EVALUADORES = new Set(["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR"]);

type EventoDia = {
  id: string | null; // null = evaluación (no editable desde el calendario)
  titulo: string;
  tipo: TipoEventoVista;
  curso: string | null;
  // Punto de color por asignatura (solo evaluaciones): convención del colegio.
  colorPunto?: string;
};

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; dia?: string }>;
}) {
  const { user } = await requerirRol(
    "ADMIN",
    "DIRECTOR",
    "UTP",
    "PROFESOR_JEFE",
    "PROFESOR",
    "INSPECTOR",
    "APODERADO",
    "ESTUDIANTE"
  );
  const sp = await searchParams;
  const mes = sp.mes && RE_MES.test(sp.mes) ? sp.mes : mesActualSantiago();
  const { inicio, fin } = rangoMes(mes);
  const puedeGestionar = GESTORES.has(user.rol);
  const puedeEvaluar = EVALUADORES.has(user.rol);
  const esApoderado = user.rol === "APODERADO";
  const esEstudiante = user.rol === "ESTUDIANTE";
  const esVistaPersonal = esApoderado || esEstudiante;


  // El apoderado solo ve eventos del colegio + de los cursos de sus pupilos, y
  // las evaluaciones de esos cursos (Ley 21.719: nada de otros estudiantes).
  const cursosPupilos = esVistaPersonal
    ? [
        ...new Set(
          (
            await prisma.matricula.findMany({
              where: {
                colegioId: user.colegioId,
                estado: "ACTIVA",
                estudiante: esApoderado
                  ? { colegioId: user.colegioId, apoderados: { some: { usuarioId: user.id } } }
                  : { colegioId: user.colegioId, accesosPortal: { some: { colegioId: user.colegioId, usuarioId: user.id, activo: true, revocadoEn: null } } },
              },
              select: { cursoId: true },
            })
          ).map((m) => m.cursoId)
        ),
      ]
    : [];

  const rango = { gte: inicio, lte: fin };
  const [eventos, evaluaciones, cursos, misAsignaturas, reuniones, personales, entrevistas] = await Promise.all([
    prisma.eventoEscolar.findMany({
      where: {
        colegioId: user.colegioId,
        eliminadaEn: null,
        fecha: rango,
        // Apoderado: solo eventos del colegio (cursoId null) o de sus cursos.
        ...(esVistaPersonal
          ? { OR: [{ cursoId: null }, { cursoId: { in: cursosPupilos } }] }
          : {}),
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        fecha: true,
        curso: { select: { nivel: true, letra: true } },
      },
      orderBy: { fecha: "asc" },
    }),
    prisma.evaluacion.findMany({
      where: {
        eliminadaEn: null,
        fecha: rango,
        asignatura: esVistaPersonal
          ? { colegioId: user.colegioId, cursoId: { in: cursosPupilos } }
          : whereAsignaturasFirma(user),
      },
      select: {
        nombre: true,
        fecha: true,
        asignatura: { select: { nombre: true, color: true, curso: { select: { nivel: true, letra: true } } } },
      },
      orderBy: { fecha: "asc" },
    }),
    puedeGestionar
      ? prisma.curso.findMany({
          where: { colegioId: user.colegioId },
          select: { id: true, nivel: true, letra: true },
          orderBy: [{ nivel: "asc" }, { letra: "asc" }],
        })
      : Promise.resolve([]),
    // Asignaturas del docente: para agendar una evaluación desde el calendario.
    puedeEvaluar
      ? prisma.asignatura.findMany({
          where: whereAsignaturasFirma(user),
          select: { id: true, nombre: true, curso: { select: { nivel: true, letra: true } } },
          orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
        })
      : Promise.resolve([]),
    // Reuniones de apoderados del mes (pedido apoderado: verlas en el calendario).
    prisma.reunionApoderados.findMany({
      where: {
        colegioId: user.colegioId,
        eliminadaEn: null,
        fecha: rango,
        ...(esVistaPersonal ? { cursoId: { in: cursosPupilos } } : {}),
      },
      select: {
        fecha: true,
        horaInicio: true,
        tema: true,
        curso: { select: { nivel: true, letra: true } },
      },
      orderBy: { fecha: "asc" },
    }),
    // Notas personales: SOLO las del usuario en sesión (agenda privada).
    prisma.eventoPersonal.findMany({
      where: { colegioId: user.colegioId, usuarioId: user.id, fecha: rango },
      select: { id: true, titulo: true, fecha: true },
      orderBy: { fecha: "asc" },
    }),
    // Entrevistas de apoderado (solo el apoderado ve las de SUS pupilos).
    esApoderado
      ? prisma.entrevista.findMany({
          where: {
            colegioId: user.colegioId,
            eliminadaEn: null,
            estudiante: { apoderados: { some: { usuarioId: user.id } } },
            OR: [{ fecha: rango }, { proximaCita: rango }],
          },
          select: { fecha: true, proximaCita: true, estudiante: { select: { nombres: true } } },
        })
      : Promise.resolve([]),
  ]);

  // Índice iso → eventos del día (eventos del colegio + evaluaciones).
  const porDia = new Map<string, EventoDia[]>();
  const agregar = (iso: string, ev: EventoDia) => {
    const lista = porDia.get(iso);
    if (lista) lista.push(ev);
    else porDia.set(iso, [ev]);
  };
  for (const e of eventos) {
    agregar(e.fecha.toISOString().slice(0, 10), {
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo as TipoEventoVista,
      curso: e.curso ? nombreCurso(e.curso) : null,
    });
  }
  for (const ev of evaluaciones) {
    agregar(ev.fecha.toISOString().slice(0, 10), {
      id: null,
      titulo: `${ev.nombre} · ${ev.asignatura.nombre}`,
      tipo: "EVALUACION",
      curso: nombreCurso(ev.asignatura.curso),
      colorPunto: colorAsignatura(ev.asignatura.nombre, ev.asignatura.color).punto,
    });
  }

  for (const p of personales) {
    agregar(p.fecha.toISOString().slice(0, 10), {
      id: null,
      titulo: p.titulo,
      tipo: "PERSONAL",
      curso: null,
    });
  }
  for (const r of reuniones) {
    agregar(r.fecha.toISOString().slice(0, 10), {
      id: null,
      titulo: `Reunión de apoderados ${r.horaInicio} · ${r.tema}`,
      tipo: "REUNION",
      curso: nombreCurso(r.curso),
    });
  }
  for (const en of entrevistas) {
    const nombre = en.estudiante.nombres.split(" ")[0];
    const fIso = en.fecha.toISOString().slice(0, 10);
    if (fIso >= inicio.toISOString().slice(0, 10) && fIso <= fin.toISOString().slice(0, 10)) {
      agregar(fIso, { id: null, titulo: `Entrevista de apoderado · ${nombre}`, tipo: "REUNION", curso: null });
    }
    if (en.proximaCita) {
      const pIso = en.proximaCita.toISOString().slice(0, 10);
      if (pIso >= inicio.toISOString().slice(0, 10) && pIso <= fin.toISOString().slice(0, 10)) {
        agregar(pIso, { id: null, titulo: `Próxima entrevista · ${nombre}`, tipo: "REUNION", curso: null });
      }
    }
  }

  // Feriados legales de Chile (capa de referencia, no eventos del colegio). Se
  // anteponen para que queden visibles aunque el día tenga otros eventos.
  for (const [iso, nombre] of Object.entries(FERIADOS_CL)) {
    const feriado: EventoDia = {
      id: null,
      titulo: nombre,
      tipo: "FERIADO",
      curso: null,
    };
    const lista = porDia.get(iso);
    if (lista) lista.unshift(feriado);
    else porDia.set(iso, [feriado]);
  }

  const semanas = construirMes(mes);
  const hoy = hoyEnSantiago();
  const totalEventos = eventos.length + evaluaciones.length;

  return (
    <div>
      <EncabezadoPagina
        icono="asistencia"
        titulo="Calendario escolar"
        descripcion="Reuniones, evaluaciones y fechas clave del colegio en un solo lugar."
      />

      {/* Barra: navegación de mes + crear evento */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/calendario?mes=${mesVecino(mes, -1)}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-borde text-tinta-suave transition-colors hover:bg-superficie-3"
            aria-label="Mes anterior"
          >
            ‹
          </Link>
          <span className="min-w-40 text-center font-display text-lg font-semibold capitalize tracking-tight">
            {formatearMesLargo(mes)}
          </span>
          <Link
            href={`/calendario?mes=${mesVecino(mes, 1)}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-borde text-tinta-suave transition-colors hover:bg-superficie-3"
            aria-label="Mes siguiente"
          >
            ›
          </Link>
          {mes !== mesActualSantiago() && (
            <Link href="/calendario" className="ml-1 text-xs font-medium text-marca-600 hover:underline">
              Hoy
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puedeGestionar && (
            <NuevoEvento
              cursos={cursos.map((c) => ({ id: c.id, nombre: nombreCurso(c) }))}
              fechaInicial={hoy}
              autoAbrir={false}
            />
          )}
        </div>
      </div>



      {/* Leyenda de tipos de evento (facilita la lectura del calendario) */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-borde bg-superficie px-4 py-2.5 text-xs text-tinta-suave">
        {Object.values(ESTILO_EVENTO).map((e) => (
          <span key={e.etiqueta} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${e.punto}`} aria-hidden />
            {e.etiqueta}
          </span>
        ))}
      </div>

      {/* Grilla mensual */}
      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie shadow-suave">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-borde">
            {NOMBRE_DIA_CORTO.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                {d}
              </div>
            ))}
          </div>
          {semanas.map((semana, i) => (
            <div key={i} className="grid grid-cols-7">
              {semana.map((celda) => {
                const esHoy = celda.iso === hoy;
                const items = porDia.get(celda.iso) ?? [];
                const claseCelda = `min-h-24 border-b border-r border-borde p-1.5 transition-colors last:border-r-0 hover:bg-marca-50/40 ${
                  esHoy
                    ? "bg-marca-50/60 ring-1 ring-inset ring-marca-200"
                    : celda.delMes
                      ? ""
                      : "bg-superficie-2/50"
                }`;
                const claseDia = `mb-1 flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums ${
                  esHoy
                    ? "bg-marca-600 font-bold text-white"
                    : celda.delMes
                      ? "text-tinta-suave"
                      : "text-tinta-tenue"
                }`;
                return (
                  <AgendarDia
                    key={celda.iso}
                    iso={celda.iso}
                    dia={celda.dia}
                    claseDia={claseDia}
                    claseCelda={claseCelda}
                    columna={semana.indexOf(celda)}
                    haciaArriba={i >= semanas.length - 2}
                    asignaturas={
                      puedeEvaluar
                        ? misAsignaturas.map((a) => ({
                            id: a.id,
                            nombre: `${a.nombre} · ${nombreCurso(a.curso)}`,
                          }))
                        : []
                    }
                  >
                    <div className="space-y-1">
                      {items.slice(0, 3).map((ev, j) => (
                        <div
                          key={j}
                          title={`${ESTILO_EVENTO[ev.tipo].etiqueta}: ${ev.titulo}${ev.curso ? ` (${ev.curso})` : ""}`}
                          className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] leading-tight transition-all duration-150 hover:-translate-y-px hover:shadow-sm ${ESTILO_EVENTO[ev.tipo].suave}`}
                        >
                          {ev.colorPunto && (
                            <span className={`h-2 w-2 shrink-0 rounded-full ${ev.colorPunto}`} aria-hidden />
                          )}
                          <span className="truncate">{ev.titulo}</span>
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div className="px-1 text-[11px] text-tinta-tenue">+{items.length - 3} más</div>
                      )}
                    </div>
                  </AgendarDia>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {(Object.keys(ESTILO_EVENTO) as TipoEventoVista[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-xs text-tinta-tenue">
            <span className={`h-2 w-2 rounded-full ${ESTILO_EVENTO[t].punto}`} aria-hidden />
            {ESTILO_EVENTO[t].etiqueta}
          </span>
        ))}
      </div>

      {/* Lista de eventos del colegio del mes (con opción de eliminar para gestores) */}
      {eventos.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-tinta-tenue">
            Eventos del mes
          </h2>
          <ul className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
            {eventos.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-b border-borde px-4 py-2.5 last:border-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ESTILO_EVENTO[e.tipo as TipoEventoVista].punto}`} aria-hidden />
                  <span className="truncate text-sm font-medium text-tinta">{e.titulo}</span>
                  <span className="shrink-0 text-xs text-tinta-tenue">
                    {e.fecha.toISOString().slice(8, 10)}/{e.fecha.toISOString().slice(5, 7)}
                    {e.curso ? ` · ${nombreCurso(e.curso)}` : " · Colegio"}
                  </span>
                </span>
                {puedeGestionar && <BotonEliminarEvento id={e.id} titulo={e.titulo} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {personales.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-tinta-tenue">
            Mis notas personales (solo tú las ves)
          </h2>
          <ul className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
            {personales.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-borde px-4 py-2.5 last:border-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" aria-hidden />
                  <span className="truncate text-sm font-medium text-tinta">{p.titulo}</span>
                  <span className="shrink-0 text-xs text-tinta-tenue">
                    {p.fecha.toISOString().slice(8, 10)}/{p.fecha.toISOString().slice(5, 7)}
                  </span>
                </span>
                <BotonEliminarPersonal id={p.id} titulo={p.titulo} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {totalEventos === 0 && (
        <p className="mt-6 text-center text-sm text-tinta-tenue">
          No hay eventos ni evaluaciones registradas en {formatearMesLargo(mes)}.
        </p>
      )}
    </div>
  );
}
