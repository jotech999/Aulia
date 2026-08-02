import { requerirRol } from "@/lib/sesion";
import { iaDisponible } from "@/lib/ia/cliente";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { BotonImprimir } from "@/components/ui/boton-imprimir";
import { nombreCurso } from "@/lib/cursos";
import { ROLES_RESOLVER_PROMOCION, type EstadoPromocion } from "@/lib/promocion";
import { cursosDelAnioActivo, cierreDeCurso } from "./consultas";
import { FilaCierre } from "./fila-cierre";
import { SelectorCurso } from "./selector-curso";

/**
 * CIERRE DE AÑO ESCOLAR (Decreto 67, art. 10 y 11).
 *
 * Muestra, por curso, el cuadro final de promoción: promedio de cada asignatura,
 * promedio general, asistencia anual y la situación de promoción propuesta por
 * el sistema. La dirección resuelve caso a caso los que no cumplen requisitos,
 * dejando el fundamento por escrito.
 */
export default async function CierreAnualPage({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string }>;
}) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP");
  const sp = await searchParams;
  const { anio, cursos } = await cursosDelAnioActivo(user.colegioId);

  if (!anio || cursos.length === 0) {
    return (
      <div>
        <EncabezadoPagina
          icono="calificaciones"
          titulo="Cierre de año escolar"
          descripcion="Promoción según el Decreto 67: promedios finales, asistencia y resolución caso a caso."
        />
        <EstadoVacio
          icono="calificaciones"
          titulo="Aún no hay cursos en el año escolar"
          descripcion="Crea el año escolar y sus cursos para poder cerrar el año."
        />
      </div>
    );
  }

  const cursoSel = cursos.find((c) => c.id === sp.cursoId) ?? cursos[0];
  const filas = await cierreDeCurso(user.colegioId, cursoSel.id, anio.id);
  const puedeResolver = ROLES_RESOLVER_PROMOCION.has(user.rol);
  const asignaturas = filas[0]?.promediosPorAsignatura.map((a) => a.nombre) ?? [];

  const cuenta = (estado: EstadoPromocion) =>
    filas.filter((f) => (f.resolucion?.estado ?? f.propuesta.estado) === estado).length;
  const promovidos = cuenta("PROMOVIDO");
  const repiten = cuenta("REPITE");
  const enAnalisis = cuenta("ANALISIS");
  const resueltos = filas.filter((f) => f.resolucion).length;
  const requierenResolucion = filas.filter(
    (f) => f.propuesta.estado !== "PROMOVIDO" && !f.resolucion
  ).length;

  const fmtFecha = (d: Date) =>
    new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "long" }).format(d);

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo={`Cierre de año escolar ${anio.anio}`}
        descripcion="Promoción según el Decreto 67: el sistema propone, la dirección resuelve de forma fundada."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <SelectorCurso
              cursos={cursos.map((c) => ({ id: c.id, etiqueta: nombreCurso(c) }))}
              cursoId={cursoSel.id}
            />
            <BotonImprimir>Imprimir acta</BotonImprimir>
          </div>
        }
      />

      {/* Resumen del curso */}
      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen del cierre">
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Promovidos</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-exito">{promovidos}</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">de {filas.length} estudiantes</p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">En análisis (Art. 11)</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-alerta">{enAnalisis}</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">requieren resolución fundada</p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Repiten</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-peligro">{repiten}</p>
        </div>
        <div className={`superficie rounded-xl p-4 ${requierenResolucion === 0 ? "acento-superior" : ""}`}>
          <p className="text-sm text-tinta-suave">Resoluciones firmadas</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-tinta">{resueltos}</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            {requierenResolucion === 0
              ? "Sin casos pendientes"
              : `${requierenResolucion} caso(s) sin resolver`}
          </p>
        </div>
      </section>

      {/* Recordatorio normativo */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-marca-200 bg-marca-50 p-3.5 text-marca-800">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-superficie shadow-suave"
          aria-hidden
        >
          §
        </span>
        <div className="text-sm leading-relaxed">
          <p className="font-semibold">Cómo lee el sistema el Decreto 67</p>
          <p className="mt-0.5 text-xs text-marca-700">
            Se promueve a quien aprueba todas las asignaturas; con 1 reprobada si su promedio
            general es ≥ 4.5; con 2 reprobadas si es ≥ 5.0. Además se exige 85% de asistencia,
            que el director puede autorizar bajo ese umbral por razones justificadas. Todo lo que
            no calza limpiamente queda en <strong>análisis caso a caso</strong> (Art. 11): el
            sistema no decide, propone.
          </p>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="mt-4">
          <EstadoVacio
            icono="estudiantes"
            titulo="Este curso no tiene matrícula activa"
            descripcion="Matricula estudiantes en el curso para poder cerrar el año."
          />
        </div>
      ) : (
        <div className="superficie mt-4 overflow-x-auto rounded-xl">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <caption className="sr-only">
              Cuadro final de promoción de {nombreCurso(cursoSel)}, año {anio.anio}
            </caption>
            <thead>
              <tr className="border-b border-borde bg-superficie-2">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-superficie-2 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-tinta-tenue"
                >
                  Estudiante
                </th>
                {asignaturas.map((a) => (
                  <th
                    key={a}
                    scope="col"
                    title={a}
                    className="max-w-[5rem] px-2 py-2.5 text-center text-xs font-semibold text-tinta-tenue"
                  >
                    <span className="line-clamp-2">{a}</span>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                  General
                </th>
                <th scope="col" className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                  Asist.
                </th>
                <th scope="col" className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                  Situación
                </th>
                <th scope="col" className="px-2 py-2.5">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <FilaCierre
                  key={f.estudianteId}
                  anioEscolarId={anio.id}
                  puedeResolver={puedeResolver}
                  iaActiva={iaDisponible()}
                  fila={{
                    estudianteId: f.estudianteId,
                    nombre: f.nombre,
                    promedios: f.promediosPorAsignatura,
                    asistencia: f.asistencia,
                    promedioGeneral: f.propuesta.promedioGeneral,
                    estadoPropuesto: f.propuesta.estado,
                    motivos: f.propuesta.motivos,
                    reprobadas: f.propuesta.asignaturasReprobadas,
                    resolucion: f.resolucion
                      ? {
                          estado: f.resolucion.estado as EstadoPromocion,
                          fundamento: f.resolucion.fundamento,
                          resueltoEn: fmtFecha(f.resolucion.resueltoEn),
                        }
                      : null,
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-tinta-tenue">
        Los promedios se calculan solo con evaluaciones sumativas vigentes y se aproximan a la
        décima. La asistencia considera todos los días con registro del año. Este cuadro es la base
        del acta de régimen interno; la evidencia legal sigue siendo el libro de clases firmado.
      </p>
    </div>
  );
}
