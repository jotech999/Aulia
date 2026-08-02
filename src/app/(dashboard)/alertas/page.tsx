import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { calcularResumen, type EstadoAsistencia } from "@/lib/asistencia";
import {
  calcularPromedio,
  promedioGeneral,
  NOTA_APROBACION,
  type ItemPromedio,
} from "@/lib/calificaciones";
import { evaluarRiesgo, ordenPorRiesgo, accionesSugeridas, type NivelRiesgo } from "@/lib/riesgo";
import { isoDesdeFecha } from "@/lib/fecha";
import { whereCursosAlertas } from "./consultas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { BarraDistribucion } from "@/components/ui/viz";
import { Intervenciones } from "./intervenciones-cliente";
import { Centinela } from "./centinela-cliente";
import { iaDisponible } from "@/lib/ia/cliente";
import { nombreCurso } from "@/lib/cursos";

const ROLES_GESTION_UTP = ["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"];


const NIVEL_UI: Record<NivelRiesgo, { label: string; badge: string; dot: string }> = {
  ALTO: { label: "Riesgo alto", badge: "bg-peligro-suave text-peligro border-peligro/20", dot: "bg-peligro" },
  MEDIO: { label: "Riesgo medio", badge: "bg-alerta-suave text-alerta border-alerta/20", dot: "bg-alerta" },
  BAJO: { label: "Sin alertas", badge: "bg-exito-suave text-exito border-exito/20", dot: "bg-exito" },
  SIN_DATOS: { label: "Sin datos", badge: "bg-superficie-3 text-tinta-tenue border-borde", dot: "bg-borde-fuerte" },
};

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string }>;
}) {
  const { user } = await requerirSesion();
  const sp = await searchParams;

  const cursos = await prisma.curso.findMany({
    where: whereCursosAlertas(user),
    select: { id: true, nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });
  const cursoSel = sp.cursoId ? cursos.find((c) => c.id === sp.cursoId) : undefined;

  if (!cursoSel) {
    return (
      <div>
        <EncabezadoPagina
          icono="alertas"
          titulo="Alertas tempranas"
          descripcion="Riesgo de repitencia/deserción por curso, a partir de asistencia, notas y anotaciones ya registradas. Elige un curso."
        />
        {["ADMIN", "DIRECTOR", "UTP"].includes(user.rol) && (
          <Centinela disponible={iaDisponible()} />
        )}
        {cursos.length === 0 ? (
          <EstadoVacio
            icono="alertas"
            titulo="No tienes cursos asignados"
            descripcion="Cuando tengas cursos a cargo, podrás revisar aquí sus alertas tempranas."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {cursos.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/alertas?cursoId=${c.id}`}
                  className="group flex items-center justify-between rounded-xl border border-borde bg-superficie p-4 shadow-suave transition-colors hover:border-borde-fuerte hover:bg-superficie-2"
                >
                  <span className="font-semibold text-tinta">{nombreCurso(c)}</span>
                  <span
                    className="text-tinta-tenue transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Estudiantes con matrícula activa.
  const matriculas = await prisma.matricula.findMany({
    where: { cursoId: cursoSel.id, colegioId: user.colegioId, estado: "ACTIVA" },
    select: { estudiante: { select: { id: true, nombres: true, apellidos: true } } },
    orderBy: { estudiante: { apellidos: "asc" } },
  });
  const estudiantes = matriculas.map((m) => m.estudiante);
  const ids = estudiantes.map((e) => e.id);

  // Señales agregadas (multi-tenant): asistencia, notas y anotaciones negativas.
  const [asistencias, asignaturas, anotaciones] = await Promise.all([
    prisma.asistenciaDiaria.findMany({
      where: { colegioId: user.colegioId, estudianteId: { in: ids } },
      select: { estudianteId: true, estado: true },
    }),
    prisma.asignatura.findMany({
      where: { cursoId: cursoSel.id, colegioId: user.colegioId },
      select: {
        nombre: true,
        evaluaciones: {
          where: { eliminadaEn: null, tipo: "SUMATIVA" },
          select: {
            ponderacion: true,
            calificaciones: {
              where: { estudianteId: { in: ids }, eliminadaEn: null },
              select: { estudianteId: true, nota: true, eximida: true },
            },
          },
        },
      },
    }),
    prisma.anotacion.groupBy({
      by: ["estudianteId"],
      where: {
        colegioId: user.colegioId,
        estudianteId: { in: ids },
        tipo: "NEGATIVA",
        eliminadaEn: null,
      },
      _count: { _all: true },
    }),
  ]);

  const estadosPorEst = new Map<string, EstadoAsistencia[]>();
  for (const a of asistencias) {
    const arr = estadosPorEst.get(a.estudianteId) ?? [];
    arr.push(a.estado);
    estadosPorEst.set(a.estudianteId, arr);
  }
  const negativasPorEst = new Map(
    anotaciones.map((g) => [g.estudianteId, g._count._all])
  );

  // Intervenciones abiertas (dupla/UTP) por estudiante.
  const intervenciones = await prisma.intervencion.findMany({
    where: { colegioId: user.colegioId, estudianteId: { in: ids }, estado: "ABIERTA", eliminadaEn: null },
    orderBy: { fecha: "desc" },
    select: { id: true, estudianteId: true, accion: true, responsable: true, fecha: true, proximoControl: true },
  });
  const ivPorEst = new Map<string, { id: string; accion: string; responsable: string; fechaISO: string; proximoControlISO: string | null }[]>();
  for (const iv of intervenciones) {
    (ivPorEst.get(iv.estudianteId) ?? ivPorEst.set(iv.estudianteId, []).get(iv.estudianteId)!).push({
      id: iv.id, accion: iv.accion, responsable: iv.responsable,
      fechaISO: isoDesdeFecha(iv.fecha), proximoControlISO: iv.proximoControl ? isoDesdeFecha(iv.proximoControl) : null,
    });
  }
  const esGestionUtp = ROLES_GESTION_UTP.includes(user.rol);

  // Pre-índice por asignatura: cada evaluación con su calificación indexada por
  // estudiante (lookup O(1)), para no buscar con `.find` dentro del bucle de
  // estudiantes (O(estudiantes²)).
  const asignaturasIdx = asignaturas.map((asig) =>
    asig.evaluaciones.map((ev) => ({
      ponderacion: ev.ponderacion,
      porEst: new Map(ev.calificaciones.map((c) => [c.estudianteId, c])),
    }))
  );

  const filas = estudiantes
    .map((e) => {
      const resumen = calcularResumen(estadosPorEst.get(e.id) ?? []);
      // Promedio por asignatura del estudiante.
      const finales: number[] = [];
      let reprobadas = 0;
      let conNota = 0;
      for (const evs of asignaturasIdx) {
        const items: ItemPromedio[] = evs.map((ev) => {
          const cal = ev.porEst.get(e.id);
          return {
            nota: cal?.eximida ? null : cal?.nota ?? null,
            ponderacion: ev.ponderacion,
            computa: !cal?.eximida,
          };
        });
        const prom = calcularPromedio(items).promedio;
        if (prom !== null) {
          conNota++;
          finales.push(prom);
          if (prom < NOTA_APROBACION) reprobadas++;
        }
      }
      const riesgo = evaluarRiesgo({
        porcentajeAsistencia: resumen.porcentaje,
        diasConRegistro: resumen.diasConRegistro,
        asignaturasReprobadas: reprobadas,
        asignaturasConNota: conNota,
        promedioGeneral: promedioGeneral(finales),
        anotacionesNegativas: negativasPorEst.get(e.id) ?? 0,
      });
      return {
        id: e.id,
        nombre: `${e.apellidos}, ${e.nombres}`,
        riesgo,
        intervenciones: ivPorEst.get(e.id) ?? [],
      };
    })
    .sort((a, b) => ordenPorRiesgo(a.riesgo, b.riesgo));

  const conRiesgo = filas.filter((f) => f.riesgo.nivel === "ALTO" || f.riesgo.nivel === "MEDIO");

  const conteoRiesgo = { ALTO: 0, MEDIO: 0, BAJO: 0, SIN_DATOS: 0 };
  for (const f of filas) conteoRiesgo[f.riesgo.nivel]++;
  const segmentosRiesgo = [
    { label: "Riesgo alto", valor: conteoRiesgo.ALTO, clase: "bg-peligro" },
    { label: "Riesgo medio", valor: conteoRiesgo.MEDIO, clase: "bg-alerta" },
    { label: "Sin alertas", valor: conteoRiesgo.BAJO, clase: "bg-exito" },
    { label: "Sin datos", valor: conteoRiesgo.SIN_DATOS, clase: "bg-borde-fuerte" },
  ];

  const conIntervencion = filas.filter((f) => f.intervenciones.length > 0).length;

  // Factores más frecuentes del curso: cuántos estudiantes presentan cada tipo
  // de señal (insight accionable para la dupla/UTP, no solo el conteo global).
  const FACTOR_LABEL: Record<string, string> = {
    ASISTENCIA: "Asistencia baja",
    NOTAS: "Ramos reprobados",
    PROMEDIO: "Promedio bajo",
    CONVIVENCIA: "Anotaciones negativas",
  };
  const factFreq = new Map<string, number>();
  for (const f of filas) {
    for (const codigo of new Set(f.riesgo.factores.map((x) => x.codigo))) {
      factFreq.set(codigo, (factFreq.get(codigo) ?? 0) + 1);
    }
  }
  const factoresTop = [...factFreq.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        icono="alertas"
        titulo={`Alertas · ${nombreCurso(cursoSel)}`}
        descripcion={`${conRiesgo.length} de ${filas.length} estudiantes con alertas.`}
        volver={{ href: "/alertas", etiqueta: "Cambiar curso" }}
        acciones={
          esGestionUtp ? (
            <a
              href={`/api/exportar/riesgo?cursoId=${cursoSel.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-borde-fuerte bg-superficie px-3 py-1.5 text-sm font-medium text-tinta shadow-suave hover:bg-superficie-2"
            >
              <span aria-hidden>↓</span> Reporte (SAC)
            </a>
          ) : undefined
        }
      />

      {filas.length > 0 && (
        <>
          {/* KPIs de resumen del curso */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-peligro/20 bg-peligro-suave p-4 text-center">
              <p className="cifra text-2xl text-peligro">{conteoRiesgo.ALTO}</p>
              <p className="mt-0.5 text-xs font-medium text-peligro">Riesgo alto</p>
            </div>
            <div className="rounded-xl border border-alerta/25 bg-alerta-suave p-4 text-center">
              <p className="cifra text-2xl text-alerta">{conteoRiesgo.MEDIO}</p>
              <p className="mt-0.5 text-xs font-medium text-alerta">Riesgo medio</p>
            </div>
            <div className="rounded-xl border border-borde bg-superficie p-4 text-center">
              <p className="cifra text-2xl text-tinta">{conIntervencion}</p>
              <p className="mt-0.5 text-xs font-medium text-tinta-tenue">Con intervención</p>
            </div>
          </div>

          <div className="superficie mb-4 rounded-xl p-5">
            <h2 className="mb-4 text-sm font-semibold text-tinta-suave">
              Distribución de riesgo del curso
            </h2>
            <BarraDistribucion
              segmentos={segmentosRiesgo}
              etiquetaAccesible={`Distribución de riesgo de ${nombreCurso(cursoSel)}`}
            />
          </div>

          {/* Factores más frecuentes: qué señal pesa más en el curso */}
          {factoresTop.length > 0 && (
            <div className="superficie mb-5 rounded-xl p-5">
              <h2 className="mb-3 text-sm font-semibold text-tinta-suave">Factores más frecuentes</h2>
              <ul className="space-y-2.5">
                {factoresTop.map(([codigo, n]) => (
                  <li key={codigo} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-sm text-tinta">{FACTOR_LABEL[codigo] ?? codigo}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-superficie-3">
                      <span
                        className="block h-full rounded-full bg-alerta"
                        style={{ width: `${Math.round((n / filas.length) * 100)}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-tinta-tenue">
                      {n} estud.
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {filas.length === 0 ? (
        <EstadoVacio
          icono="estudiantes"
          titulo="Sin estudiantes activos"
          descripcion="Este curso no tiene estudiantes con matrícula activa."
        />
      ) : (
        <ul className="mt-5 space-y-2">
          {filas.map((f) => {
            const ui = NIVEL_UI[f.riesgo.nivel];
            const sinFactores = f.riesgo.factores.length === 0;
            return (
              <li
                key={f.id}
                className="relative overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave transition-shadow hover:shadow-elevada"
              >
                {/* Franja de nivel de riesgo: jerarquía visible sin abrir la tarjeta */}
                <span className={`absolute inset-y-0 left-0 w-1 ${ui.dot}`} aria-hidden />
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 pl-5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ui.dot}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-tinta">
                        {f.nombre}
                      </span>
                      <span
                        className={`mt-0.5 inline-block rounded-md border px-1.5 py-0.5 text-xs font-semibold ${ui.badge}`}
                      >
                        {ui.label}
                        {f.riesgo.nivel !== "SIN_DATOS" && ` · ${f.riesgo.puntaje} pts`}
                        {!sinFactores && ` · ${f.riesgo.factores.length} factor(es)`}
                        {f.intervenciones.length > 0 && ` · ${f.intervenciones.length} intervención(es)`}
                      </span>
                    </span>
                    <Link
                      href={`/admin/estudiantes/${f.id}`}
                      className="shrink-0 text-xs font-medium text-tinta-tenue hover:text-tinta"
                    >
                      Ficha →
                    </Link>
                  </summary>
                  <div className="border-t border-borde bg-superficie-2/60 px-4 py-3 text-sm">
                    {!sinFactores && (
                      <ul>
                        {f.riesgo.factores.map((factor) => (
                          <li key={factor.codigo} className="flex gap-2 py-1">
                            <span className="font-medium text-tinta">{factor.etiqueta}:</span>
                            <span className="text-tinta-tenue">{factor.detalle}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(() => {
                      const sugerencias = accionesSugeridas(f.riesgo.factores);
                      return sugerencias.length > 0 ? (
                        <div className="mt-2 rounded-lg border border-marca-200 bg-marca-50/60 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-marca-700">
                            Acciones sugeridas
                          </p>
                          <ul className="mt-1 space-y-1">
                            {sugerencias.map((s, i) => (
                              <li key={i} className="flex gap-1.5 text-sm text-tinta-suave">
                                <span className="text-marca-500" aria-hidden>→</span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null;
                    })()}
                    {(f.riesgo.nivel === "ALTO" || f.riesgo.nivel === "MEDIO" || f.intervenciones.length > 0) && (
                      <Intervenciones estudianteId={f.id} abiertas={f.intervenciones} />
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-tinta-tenue">
        El puntaje se calcula con una regla transparente sobre datos ya
        registrados. Es una señal para intervenir a tiempo, no una decisión de
        promoción (Decreto 67).
      </p>
    </div>
  );
}
