import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  asignaturaCanonica,
  autorizarPlanificacion,
} from "@/lib/planificacion";
import { fechaDesdeISO, isoDesdeFecha } from "@/lib/fecha";
import { colorAsignatura } from "@/lib/colores-asignatura";
import { whereAsignaturasAccesibles } from "./consultas";
import { Planificador } from "./planificador-cliente";
import { iaDisponible } from "@/lib/ia/cliente";
import { calcularClasesMensuales } from "./calendario-planificacion";
import { FERIADOS_CL } from "@/lib/feriados";
import { nombreCurso } from "@/lib/cursos";


export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ asignaturaId?: string }>;
}) {
  const { user } = await requerirSesion();
  const sp = await searchParams;

  const asignaturas = await prisma.asignatura.findMany({
    where: whereAsignaturasAccesibles(user),
    select: {
      id: true,
      nombre: true,
      color: true,
      docenteId: true,
      curso: {
        select: {
          id: true,
          nivel: true,
          letra: true,
          anioEscolar: { select: { anio: true } },
        },
      },
    },
    orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
  });

  const asignaturaSel = sp.asignaturaId
    ? asignaturas.find((a) => a.id === sp.asignaturaId)
    : undefined;

  if (!asignaturaSel) {
    return (
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Planificación</h1>
            <p className="mt-1 text-sm text-tinta-tenue">
              Planifica por unidad y clase, vinculando los OA del currículum.
            </p>
          </div>
          <Link
            href="/planificacion/cobertura"
            className="rounded-xl border border-borde bg-superficie px-3 py-2 text-sm font-medium shadow-suave hover:bg-superficie-2"
          >
            📊 Cobertura curricular
          </Link>
        </div>
        {asignaturas.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
            No tienes asignaturas asignadas.
          </div>
        ) : (
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {asignaturas.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/planificacion?asignaturaId=${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-borde bg-superficie p-4 shadow-suave transition hover:border-borde-fuerte hover:bg-superficie-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`h-10 w-1.5 shrink-0 rounded-full ${colorAsignatura(a.nombre, a.color).punto}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{a.nombre}</span>
                      <span className="block text-sm text-tinta-tenue">
                        {nombreCurso(a.curso)}
                      </span>
                    </span>
                  </span>
                  <span className="text-tinta-tenue" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const puedeEditar = autorizarPlanificacion(user.rol, user.id, asignaturaSel);
  const canonica = asignaturaCanonica(asignaturaSel.nombre);

  // OA disponibles para vincular: del nivel y asignatura del curso.
  const oaDisponibles = canonica
    ? await prisma.oa.findMany({
        where: { nivel: asignaturaSel.curso.nivel, asignatura: canonica },
        select: { codigo: true, eje: true, numero: true, descripcion: true },
        orderBy: { numero: "asc" },
      })
    : [];

  const planificaciones = await prisma.planificacion.findMany({
    where: {
      asignaturaId: asignaturaSel.id,
      colegioId: user.colegioId,
      eliminadaEn: null,
    },
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descripcion: true,
      fechaInicio: true,
      fechaFin: true,
      fechaClase: true,
      estadoClase: true,
      ordenClase: true,
      padreId: true,
      esPlantilla: true,
      version: true,
      oas: { select: { oaCodigo: true } },
    },
    orderBy: [{ tipo: "asc" }, { ordenClase: "asc" }, { creadaEn: "asc" }],
  });

  const anioEscolar = asignaturaSel.curso.anioEscolar.anio;
  const [versionesHorario, suspensiones] = await Promise.all([
    prisma.horarioVersion.findMany({
      where: {
        colegioId: user.colegioId,
        estado: "PUBLICADO",
        horarioCurso: { cursoId: asignaturaSel.curso.id },
        vigenteDesde: { lte: fechaDesdeISO(`${anioEscolar}-12-31`) },
        OR: [
          { vigenteHasta: null },
          { vigenteHasta: { gte: fechaDesdeISO(`${anioEscolar}-03-01`) } },
        ],
      },
      select: {
        numero: true,
        vigenteDesde: true,
        vigenteHasta: true,
        bloques: {
          where: {
            colegioId: user.colegioId,
            asignaturaId: asignaturaSel.id,
            eliminadaEn: null,
          },
          select: { dia: true },
        },
      },
      orderBy: [{ vigenteDesde: "asc" }, { numero: "asc" }],
    }),
    prisma.eventoEscolar.findMany({
      where: {
        colegioId: user.colegioId,
        tipo: "SUSPENSION",
        eliminadaEn: null,
        fecha: {
          gte: fechaDesdeISO(`${anioEscolar}-03-01`),
          lte: fechaDesdeISO(`${anioEscolar}-12-31`),
        },
        OR: [{ cursoId: null }, { cursoId: asignaturaSel.curso.id }],
      },
      select: { fecha: true },
    }),
  ]);
  const clasesPorMes = calcularClasesMensuales({
    anio: anioEscolar,
    versiones: versionesHorario.map((version) => ({
      numero: version.numero,
      vigenteDesde: isoDesdeFecha(version.vigenteDesde),
      vigenteHasta: version.vigenteHasta
        ? isoDesdeFecha(version.vigenteHasta)
        : null,
      bloques: version.bloques,
    })),
    suspensiones: suspensiones.map((evento) => isoDesdeFecha(evento.fecha)),
  });
  const feriadosVerificados = Object.keys(FERIADOS_CL).some((fecha) =>
    fecha.startsWith(`${anioEscolar}-`)
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/planificacion"
            className="text-xs text-tinta-tenue hover:text-tinta-suave"
          >
            ← Cambiar asignatura
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {asignaturaSel.nombre}
          </h1>
          <p className="mt-0.5 text-sm text-tinta-tenue">
            {nombreCurso(asignaturaSel.curso)}
          </p>
        </div>
        <Link
          href={`/planificacion/cobertura?asignaturaId=${asignaturaSel.id}`}
          className="rounded-xl border border-borde bg-superficie px-3 py-2 text-sm font-medium shadow-suave hover:bg-superficie-2"
        >
          📊 Ver cobertura
        </Link>
      </div>

      {!canonica && (
        <p className="mt-4 rounded-xl border border-alerta/20 bg-alerta-suave px-4 py-2 text-sm text-alerta">
          Aún no hay OA de currículum cargados para esta asignatura; puedes
          planificar igualmente, pero sin vínculo a OA.
        </p>
      )}

      <Planificador
        asignaturaId={asignaturaSel.id}
        asignaturaNombre={asignaturaSel.nombre}
        asignaturaColor={asignaturaSel.color}
        anioEscolar={anioEscolar}
        clasesPorMes={clasesPorMes}
        tieneHorarioPublicado={versionesHorario.length > 0}
        feriadosVerificados={feriadosVerificados}
        puedeEditar={puedeEditar}
        iaActiva={iaDisponible()}
        oaDisponibles={oaDisponibles}
        planificaciones={planificaciones.map((p) => ({
          id: p.id,
          tipo: p.tipo,
          titulo: p.titulo,
          descripcion: p.descripcion,
          fechaInicio: p.fechaInicio ? isoDesdeFecha(p.fechaInicio) : null,
          fechaFin: p.fechaFin ? isoDesdeFecha(p.fechaFin) : null,
          fechaClase: p.fechaClase ? isoDesdeFecha(p.fechaClase) : null,
          estadoClase: p.estadoClase,
          ordenClase: p.ordenClase,
          padreId: p.padreId,
          oaCodigos: p.oas.map((o) => o.oaCodigo),
          esPlantilla: p.esPlantilla,
          version: p.version,
        }))}
      />
    </div>
  );
}
