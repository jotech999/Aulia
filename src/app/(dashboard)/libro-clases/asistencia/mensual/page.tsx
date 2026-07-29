import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  calcularResumen,
  UMBRAL_ASISTENCIA,
  type EstadoAsistencia,
} from "@/lib/asistencia";
import {
  formatearMesLargo,
  isoDesdeFecha,
  mesActualSantiago,
  rangoMes,
} from "@/lib/fecha";
import { whereCursosAccesibles } from "../consultas";
import { ESTADOS_UI, ORDEN_CICLO } from "../estados-ui";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { BarraDistribucion, Medidor } from "@/components/ui/viz";
import { nombreCurso } from "@/lib/cursos";


const RE_MES = /^\d{4}-\d{2}$/;

export default async function AsistenciaMensualPage({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string; mes?: string }>;
}) {
  const { user } = await requerirSesion();
  const sp = await searchParams;
  const mes = sp.mes && RE_MES.test(sp.mes) ? sp.mes : mesActualSantiago();

  const cursos = await prisma.curso.findMany({
    where: whereCursosAccesibles(user),
    select: { id: true, nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });
  const cursoSel = sp.cursoId
    ? cursos.find((c) => c.id === sp.cursoId)
    : undefined;

  const selector = (
    <form
      method="get"
      action="/libro-clases/asistencia/mensual"
      className="flex flex-wrap items-center gap-2"
    >
      <select
        name="cursoId"
        defaultValue={cursoSel?.id ?? ""}
        aria-label="Curso"
        className="rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm font-medium shadow-suave outline-none focus-visible:ring-2 focus-visible:ring-marca-200"
      >
        <option value="" disabled>
          Elige un curso…
        </option>
        {cursos.map((c) => (
          <option key={c.id} value={c.id}>
            {nombreCurso(c)}
          </option>
        ))}
      </select>
      <input
        type="month"
        name="mes"
        defaultValue={mes}
        max={mesActualSantiago()}
        aria-label="Mes"
        className="rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm font-medium shadow-suave outline-none focus-visible:ring-2 focus-visible:ring-marca-200"
      />
      <button
        type="submit"
        className="btn btn-primario"
      >
        Ver
      </button>
    </form>
  );

  const encabezado = (
    <EncabezadoPagina
      icono="asistencia"
      titulo="Asistencia mensual"
      descripcion="Resumen del libro de clases"
      acciones={selector}
    />
  );

  if (!cursoSel) {
    return (
      <div>
        {encabezado}
        <EstadoVacio
          icono="asistencia"
          titulo="Elige un curso y un mes"
          descripcion="Selecciona un curso y un mes para ver el detalle de asistencia con su distribución."
        />
      </div>
    );
  }

  // Estudiantes con matrícula activa, ordenados.
  const matriculas = await prisma.matricula.findMany({
    where: { cursoId: cursoSel.id, colegioId: user.colegioId, estado: "ACTIVA" },
    select: {
      estudiante: { select: { id: true, nombres: true, apellidos: true } },
    },
    orderBy: { estudiante: { apellidos: "asc" } },
  });
  const estudiantes = matriculas.map((m) => ({
    id: m.estudiante.id,
    nombre: `${m.estudiante.apellidos}, ${m.estudiante.nombres}`,
  }));

  const { inicio, fin, dias } = rangoMes(mes);

  // Asistencias del mes: por estudianteId del curso + rango de fecha (usa el
  // índice unique [estudianteId, fecha]). colegioId como guardia de tenant.
  const registros = estudiantes.length
    ? await prisma.asistenciaDiaria.findMany({
        where: {
          colegioId: user.colegioId,
          estudianteId: { in: estudiantes.map((e) => e.id) },
          fecha: { gte: inicio, lte: fin },
        },
        select: { estudianteId: true, fecha: true, estado: true },
      })
    : [];

  // Mapa estudiante → { iso → estado }
  const porEstudiante = new Map<string, Map<string, EstadoAsistencia>>();
  for (const r of registros) {
    const iso = isoDesdeFecha(r.fecha);
    const mapa = porEstudiante.get(r.estudianteId) ?? new Map();
    mapa.set(iso, r.estado);
    porEstudiante.set(r.estudianteId, mapa);
  }

  const filas = estudiantes.map((e) => {
    const mapa = porEstudiante.get(e.id) ?? new Map<string, EstadoAsistencia>();
    const resumen = calcularResumen([...mapa.values()]);
    return { ...e, mapa, ...resumen };
  });

  // Resumen del curso: todos los estados juntos, y días con clase (fechas con registro).
  const resumenCurso = calcularResumen(registros.map((r) => r.estado));
  const diasDeClase = new Set(registros.map((r) => isoDesdeFecha(r.fecha))).size;
  const bajoUmbral = filas.filter(
    (f) => f.porcentaje !== null && f.porcentaje < UMBRAL_ASISTENCIA
  ).length;

  // Distribución de estados para la barra de composición.
  const conteo: Record<EstadoAsistencia, number> = {
    PRESENTE: 0,
    ATRASADO: 0,
    RETIRADO: 0,
    AUSENTE: 0,
  };
  for (const r of registros) conteo[r.estado]++;
  const segmentos = ORDEN_CICLO.map((e) => ({
    label: ESTADOS_UI[e].label,
    valor: conteo[e],
    clase: ESTADOS_UI[e].celda.split(" ")[0], // "bg-exito"
  }));

  const fmtPct = (p: number | null) => (p === null ? "—" : `${p.toFixed(1)}%`);

  return (
    <div>
      {encabezado}

      <p className="-mt-3 mb-4 text-sm text-tinta-suave">
        {nombreCurso(cursoSel)} · {formatearMesLargo(mes)}
      </p>

      {/* Resumen visual: medidor de asistencia + composición de estados */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="superficie flex items-center justify-center rounded-xl p-5">
          <Medidor
            valor={resumenCurso.porcentaje}
            etiqueta="Asistencia del curso"
            umbral={UMBRAL_ASISTENCIA}
          />
        </div>
        <div className="superficie flex flex-col rounded-xl p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-tinta-suave">
              Distribución de asistencias
            </h2>
            <span className="text-xs text-tinta-tenue">
              {diasDeClase} {diasDeClase === 1 ? "día de clase" : "días de clase"}
            </span>
          </div>
          <div className="mt-4">
            <BarraDistribucion
              segmentos={segmentos}
              etiquetaAccesible={`Distribución de asistencia de ${nombreCurso(cursoSel)}`}
            />
          </div>
          <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
            <div className="rounded-lg bg-superficie-3 px-3 py-2">
              <p className="text-xs text-tinta-tenue">Estudiantes</p>
              <p className="font-display text-xl font-bold tabular-nums">{estudiantes.length}</p>
            </div>
            <div className="rounded-lg bg-superficie-3 px-3 py-2">
              <p className="text-xs text-tinta-tenue">Bajo {UMBRAL_ASISTENCIA}%</p>
              <p
                className={`font-display text-xl font-bold tabular-nums ${
                  bajoUmbral > 0 ? "text-peligro" : "text-tinta"
                }`}
              >
                {bajoUmbral}
              </p>
            </div>
          </div>
        </div>
      </div>

      {estudiantes.length === 0 ? (
        <EstadoVacio
          icono="estudiantes"
          titulo="Sin estudiantes activos"
          descripcion="Este curso no tiene estudiantes con matrícula activa."
        />
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
            {/* Único contenedor con scroll horizontal: el body de la página nunca scrollea en X */}
            <div className="overflow-x-auto">
              <table className="w-max min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-borde bg-superficie-2 text-xs text-tinta-tenue">
                    <th className="sticky left-0 z-20 bg-superficie-2 px-3 py-2 text-left font-medium">
                      Estudiante
                    </th>
                    {dias.map((d) => (
                      <th
                        key={d.iso}
                        className={`w-8 px-0 py-2 text-center font-medium ${
                          d.finDeSemana ? "text-tinta-tenue" : ""
                        }`}
                      >
                        {d.dia}
                      </th>
                    ))}
                    <th className="sticky right-0 z-20 bg-superficie-2 px-3 py-2 text-right font-medium">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const bajo =
                      f.porcentaje !== null && f.porcentaje < UMBRAL_ASISTENCIA;
                    return (
                      <tr
                        key={f.id}
                        className="border-b border-borde last:border-0"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 max-w-[9rem] truncate bg-superficie px-3 py-1.5 text-left font-medium text-tinta"
                          title={f.nombre}
                        >
                          {f.nombre}
                        </th>
                        {dias.map((d) => {
                          const estado = f.mapa.get(d.iso);
                          if (!estado) {
                            return (
                              <td key={d.iso} className="p-0.5">
                                <span
                                  className="mx-auto block h-6 w-6 rounded bg-superficie-2"
                                  aria-hidden
                                />
                              </td>
                            );
                          }
                          const s = ESTADOS_UI[estado];
                          return (
                            <td key={d.iso} className="p-0.5">
                              <span
                                className={`mx-auto grid h-6 w-6 cursor-default place-items-center rounded text-[10px] font-bold transition-transform duration-100 hover:scale-125 hover:shadow-md ${s.celda}`}
                                title={`${d.iso}: ${s.label}`}
                                aria-label={`${d.iso}: ${s.label}`}
                              >
                                {s.abrev}
                              </span>
                            </td>
                          );
                        })}
                        <td
                          className={`sticky right-0 z-10 px-3 py-1.5 text-right font-semibold tabular-nums ${
                            bajo ? "bg-peligro-suave text-peligro" : "bg-superficie text-tinta"
                          }`}
                        >
                          {bajo && (
                            <span className="mr-1" aria-label="Bajo el umbral">
                              ⚠
                            </span>
                          )}
                          {fmtPct(f.porcentaje)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-tinta-tenue md:hidden">
            Desliza la tabla para ver todos los días →
          </p>
        </>
      )}

      <div className="mt-6">
        <Link
          href={`/libro-clases/asistencia?cursoId=${cursoSel.id}`}
          className="text-sm text-tinta-tenue underline hover:text-tinta"
        >
          ← Volver al registro diario
        </Link>
      </div>
    </div>
  );
}
