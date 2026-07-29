import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  asignaturaCanonica,
  calcularCobertura,
  esRolColegio,
  type OaRef,
  type ResumenCobertura,
} from "@/lib/planificacion";
import { whereAsignaturasAccesibles } from "../consultas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { nombreCurso } from "@/lib/cursos";


function Barra({ pct, tone }: { pct: number; tone: "trat" | "plan" }) {
  const color = tone === "trat" ? "bg-exito" : "bg-marca-400";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-superficie-3">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export default async function CoberturaPage({
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
      curso: { select: { nivel: true, letra: true } },
    },
    orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
  });

  const ids = asignaturas.map((a) => a.id);

  // Universo de OA por (nivel, asignatura canónica), consultado una vez por clave.
  const claves = new Map<string, { nivel: string; canonica: string }>();
  for (const a of asignaturas) {
    const canonica = asignaturaCanonica(a.nombre);
    if (canonica) claves.set(`${a.curso.nivel}|${canonica}`, { nivel: a.curso.nivel, canonica });
  }
  const universoPorClave = new Map<string, OaRef[]>();
  for (const [clave, { nivel, canonica }] of claves) {
    const oas = await prisma.oa.findMany({
      where: { nivel, asignatura: canonica },
      select: { codigo: true, eje: true },
    });
    universoPorClave.set(clave, oas);
  }

  // Planificados: OA en planificaciones vivas, por asignatura (multi-tenant).
  const planFilas = ids.length
    ? await prisma.planificacionOa.findMany({
        where: {
          planificacion: {
            asignaturaId: { in: ids },
            colegioId: user.colegioId,
            eliminadaEn: null,
          },
        },
        select: { oaCodigo: true, planificacion: { select: { asignaturaId: true } } },
      })
    : [];
  const planPorAsig = new Map<string, Set<string>>();
  for (const f of planFilas) {
    const set = planPorAsig.get(f.planificacion.asignaturaId) ?? new Set<string>();
    set.add(f.oaCodigo);
    planPorAsig.set(f.planificacion.asignaturaId, set);
  }

  // Tratados: OA en clases FIRMADAS (evidencia del libro de clases).
  const clases = ids.length
    ? await prisma.claseRegistrada.findMany({
        where: {
          asignaturaId: { in: ids },
          colegioId: user.colegioId,
          firmadaEn: { not: null },
          eliminadaEn: null,
        },
        select: { asignaturaId: true, oaIds: true },
      })
    : [];
  const tratPorAsig = new Map<string, Set<string>>();
  for (const c of clases) {
    const set = tratPorAsig.get(c.asignaturaId) ?? new Set<string>();
    for (const codigo of c.oaIds) set.add(codigo);
    tratPorAsig.set(c.asignaturaId, set);
  }

  const resumenPorAsig = new Map<string, ResumenCobertura>();
  for (const a of asignaturas) {
    const canonica = asignaturaCanonica(a.nombre);
    const universo = canonica
      ? universoPorClave.get(`${a.curso.nivel}|${canonica}`) ?? []
      : [];
    resumenPorAsig.set(
      a.id,
      calcularCobertura(
        universo,
        planPorAsig.get(a.id) ?? new Set(),
        tratPorAsig.get(a.id) ?? new Set()
      )
    );
  }

  const detalle = sp.asignaturaId
    ? asignaturas.find((a) => a.id === sp.asignaturaId)
    : undefined;

  // ── Vista detalle de una asignatura ────────────────────────────────────
  if (detalle) {
    const resumen = resumenPorAsig.get(detalle.id)!;

    // Avance de CLASES del plan: denominador = clases con fecha que no están
    // suspendidas; realizadas = clases con evidencia FIRMADA en el leccionario
    // (Circular 30). El estado "Realizada" sin firma se muestra como pendiente.
    const clasesPlan = await prisma.planificacion.findMany({
      where: {
        asignaturaId: detalle.id,
        colegioId: user.colegioId,
        tipo: "CLASE",
        esPlantilla: false,
        eliminadaEn: null,
        estadoClase: { not: "SUSPENDIDA" },
      },
      select: {
        id: true,
        clasesOrigen: {
          where: { firmadaEn: { not: null }, eliminadaEn: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    const totalClasesPlan = clasesPlan.length;
    const clasesRealizadas = clasesPlan.filter((c) => c.clasesOrigen.length > 0).length;
    const pctClases =
      totalClasesPlan === 0
        ? 0
        : Math.round((clasesRealizadas / totalClasesPlan) * 1000) / 10;
    const canonica = asignaturaCanonica(detalle.nombre);
    const universo = canonica
      ? await prisma.oa.findMany({
          where: { nivel: detalle.curso.nivel, asignatura: canonica },
          select: { codigo: true, eje: true, numero: true, descripcion: true },
          orderBy: { numero: "asc" },
        })
      : [];
    const planSet = planPorAsig.get(detalle.id) ?? new Set();
    const tratSet = tratPorAsig.get(detalle.id) ?? new Set();

    return (
      <div>
        <EncabezadoPagina
          icono="cobertura"
          titulo="Cobertura curricular"
          descripcion={`${detalle.nombre} · ${nombreCurso(detalle.curso)}`}
          volver={{ href: "/planificacion/cobertura", etiqueta: "Todas las asignaturas" }}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="superficie acento-superior rounded-xl p-5">
            <p className="text-sm font-medium text-tinta-suave">OA tratados (firmados)</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums text-exito">
              {resumen.pctTratado}%
            </p>
            <p className="text-xs text-tinta-tenue">
              {resumen.tratados} de {resumen.total} OA
            </p>
            <div className="mt-3">
              <Barra pct={resumen.pctTratado} tone="trat" />
            </div>
          </div>
          <div className="superficie rounded-xl p-5">
            <p className="text-sm font-medium text-tinta-suave">OA planificados</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums text-marca-600">
              {resumen.pctPlanificado}%
            </p>
            <p className="text-xs text-tinta-tenue">
              brecha planificado vs. tratado:{" "}
              {Math.max(resumen.pctPlanificado - resumen.pctTratado, 0).toFixed(1)}%
            </p>
            <div className="mt-3">
              <Barra pct={resumen.pctPlanificado} tone="plan" />
            </div>
          </div>
        </div>

        {totalClasesPlan > 0 && (
          <div className="mt-3 superficie rounded-xl p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-tinta-suave">
                Clases del plan realizadas (firmadas)
              </p>
              <p className="font-display text-2xl font-bold tabular-nums text-exito">
                {pctClases}%
              </p>
            </div>
            <p className="text-xs text-tinta-tenue">
              {clasesRealizadas} de {totalClasesPlan} clases planificadas ya firmadas
              en el leccionario
            </p>
            <div className="mt-3">
              <Barra pct={pctClases} tone="trat" />
            </div>
          </div>
        )}

        {resumen.porEje.length > 0 && (
          <div className="mt-6">
            <h2 className="font-display text-base font-semibold tracking-tight">Por eje</h2>
            <ul className="mt-3 space-y-2">
              {resumen.porEje.map((e) => (
                <li key={e.eje} className="superficie rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-tinta">{e.eje}</span>
                    <span className="tabular-nums text-tinta-suave">
                      {e.tratados}/{e.total} tratados
                    </span>
                  </div>
                  <div className="mt-2">
                    <Barra pct={e.total ? (e.tratados / e.total) * 100 : 0} tone="trat" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {universo.length > 0 && (
          <div className="mt-6">
            <h2 className="font-display text-base font-semibold tracking-tight">
              Detalle de OA
            </h2>
            <ul className="mt-3 space-y-1">
              {universo.map((oa) => {
                const tratado = tratSet.has(oa.codigo);
                const planificado = planSet.has(oa.codigo);
                const estado = tratado
                  ? { txt: "Tratado", cls: "bg-exito-suave text-exito" }
                  : planificado
                    ? { txt: "Planificado", cls: "bg-marca-50 text-marca-700" }
                    : { txt: "Pendiente", cls: "bg-superficie-3 text-tinta-tenue" };
                return (
                  <li
                    key={oa.codigo}
                    className="flex items-start gap-2 rounded-lg border border-borde bg-superficie p-2.5 text-sm"
                  >
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${estado.cls}`}
                    >
                      {estado.txt}
                    </span>
                    <span>
                      <span className="font-mono text-xs font-semibold text-tinta-suave">
                        {oa.codigo}
                      </span>
                      <span className="ml-1 text-tinta-suave">{oa.descripcion}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ── Vista resumen (todas las asignaturas accesibles) ───────────────────
  return (
    <div>
      <EncabezadoPagina
        icono="cobertura"
        titulo="Cobertura curricular"
        descripcion={`${
          esRolColegio(user.rol)
            ? "Avance de OA por asignatura en el colegio."
            : "Avance de OA de tus asignaturas."
        } La cobertura oficial cuenta OA tratados en clases firmadas.`}
        volver={{ href: "/planificacion", etiqueta: "Planificación" }}
      />

      {asignaturas.length === 0 ? (
        <EstadoVacio
          icono="cobertura"
          titulo="Sin asignaturas"
          descripcion="No hay asignaturas para mostrar todavía."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie shadow-suave">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borde bg-superficie-2 text-xs uppercase tracking-wide text-tinta-tenue">
              <tr>
                <th className="px-4 py-3">Asignatura</th>
                <th className="px-4 py-3">Curso</th>
                <th className="w-48 px-4 py-3">Tratado</th>
                <th className="w-48 px-4 py-3">Planificado</th>
              </tr>
            </thead>
            <tbody>
              {asignaturas.map((a) => {
                const r = resumenPorAsig.get(a.id)!;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-borde last:border-0 transition-colors hover:bg-superficie-2"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/planificacion/cobertura?asignaturaId=${a.id}`}
                        className="text-tinta hover:text-marca-700 hover:underline"
                      >
                        {a.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-tinta-suave">{nombreCurso(a.curso)}</td>
                    <td className="px-4 py-3">
                      {r.total === 0 ? (
                        <span className="text-xs text-tinta-tenue">Sin OA</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="w-10 shrink-0 font-semibold tabular-nums text-exito">
                            {r.pctTratado}%
                          </span>
                          <Barra pct={r.pctTratado} tone="trat" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.total === 0 ? (
                        <span className="text-xs text-tinta-tenue">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="w-10 shrink-0 font-semibold tabular-nums text-marca-600">
                            {r.pctPlanificado}%
                          </span>
                          <Barra pct={r.pctPlanificado} tone="plan" />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
