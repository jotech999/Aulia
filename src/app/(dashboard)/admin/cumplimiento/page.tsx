import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Insignia } from "@/components/ui/insignia";
import { TarjetaKPI } from "@/components/ui/tarjeta-kpi";
import {
  obtenerCentroCumplimiento,
  type SemaforoCumplimiento,
} from "@/lib/cumplimiento";
import { requerirRol } from "@/lib/sesion";

const TONO_ESTADO: Record<
  SemaforoCumplimiento,
  "exito" | "alerta" | "neutra"
> = {
  listo: "exito",
  atencion: "alerta",
  pendiente: "neutra",
};

const ESTADO_EDE: Record<
  string,
  { etiqueta: string; tono: "exito" | "alerta" | "neutra" | "peligro" }
> = {
  BORRADOR: { etiqueta: "Borrador", tono: "neutra" },
  GENERANDO: { etiqueta: "Generando", tono: "alerta" },
  CON_ERRORES: { etiqueta: "Con errores", tono: "peligro" },
  LISTA_PARA_VALIDAR: { etiqueta: "Lista para validar", tono: "alerta" },
  VALIDADA: { etiqueta: "Validación registrada", tono: "exito" },
  EXPORTADA: { etiqueta: "Exportada", tono: "exito" },
};

function formatearFecha(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

function formatearTamano(bytes: number | null): string {
  if (bytes === null) return "Sin tamaño";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function CumplimientoPage() {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP");
  const centro = await obtenerCentroCumplimiento(user.colegioId);
  if (!centro) notFound();

  const completados = centro.checklist.filter((item) => item.completado).length;

  return (
    <div className="mx-auto max-w-7xl">
      <EncabezadoPagina
        icono="escudo"
        titulo="Centro de cumplimiento"
        descripcion="Evidencia operativa para dirección: libro de clases, EDE, respaldos, firma y privacidad."
      />

      <section
        className="superficie superficie-realce relative overflow-hidden rounded-2xl border border-marca-200 p-5 sm:p-6"
        aria-labelledby="alcance-cumplimiento"
      >
        <span
          className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-marca-50"
          aria-hidden
        />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="max-w-3xl">
            <Insignia tono="marca" punto>
              Preparación interna · no certificado
            </Insignia>
            <h2
              id="alcance-cumplimiento"
              className="mt-3 font-display text-xl font-bold text-tinta"
            >
              Evidencia de {centro.colegio.nombre}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-tinta-suave">
              Este tablero ayuda a preparar y revisar antecedentes. No acredita
              homologación EDE, certificación de la plataforma ni aprobación de
              Mineduc o de la Superintendencia. Las validaciones oficiales se
              realizan fuera de Aulia con las herramientas y procesos vigentes.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-borde bg-superficie-2 px-4 py-3 text-sm">
            <p className="font-medium text-tinta">Corte del diagnóstico</p>
            <p className="mt-0.5 tabular-nums text-tinta-tenue">
              {formatearFecha(centro.generadoEn)}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen">
        <TarjetaKPI
          titulo="Frentes con evidencia"
          valor={`${centro.resumen.conEvidencia}/6`}
          contexto="Evidencia disponible, no certificación"
          icono="escudo"
          destacado
        />
        <TarjetaKPI
          titulo="Requieren atención"
          valor={centro.resumen.porAtender}
          contexto="Revisar antes de un piloto"
          icono="alertas"
          tono={centro.resumen.porAtender > 0 ? "alerta" : "neutro"}
        />
        <TarjetaKPI
          titulo="Sin evidencia"
          valor={centro.resumen.pendientes}
          contexto="Controles aún no demostrados"
          icono="candado"
          tono={centro.resumen.pendientes > 0 ? "peligro" : "neutro"}
        />
        <TarjetaKPI
          titulo="Checklist preparado"
          valor={`${centro.resumen.avanceChecklist}%`}
          contexto={`${completados} de ${centro.checklist.length} verificaciones`}
          icono="asistencia"
        />
      </section>

      <section className="mt-8" aria-labelledby="evidencias-titulo">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="evidencias-titulo" className="font-display text-lg font-bold text-tinta">
              Evidencias por frente
            </h2>
            <p className="mt-0.5 text-sm text-tinta-suave">
              Cada estado incluye qué demuestra hoy y cuál es el siguiente paso.
            </p>
          </div>
          <p className="text-xs text-tinta-tenue">
            El color siempre se acompaña de texto y evidencia.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {centro.evidencias.map((evidencia) => (
            <article
              key={evidencia.clave}
              className="superficie flex min-h-64 flex-col rounded-xl p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                    {evidencia.clave}
                  </p>
                  <h3 className="mt-1 font-display text-base font-bold text-tinta">
                    {evidencia.titulo}
                  </h3>
                </div>
                <Insignia tono={TONO_ESTADO[evidencia.estado]} punto>
                  {evidencia.etiqueta}
                </Insignia>
              </div>

              <div className="mt-4 rounded-lg bg-superficie-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                  Evidencia disponible
                </p>
                <p className="mt-1 text-sm leading-relaxed text-tinta-suave">
                  {evidencia.evidencia}
                </p>
              </div>

              <div className="mt-auto pt-4">
                <p className="text-xs font-semibold text-tinta">Siguiente paso</p>
                <p className="mt-1 text-sm leading-relaxed text-tinta-suave">
                  {evidencia.siguientePaso}
                </p>
                {evidencia.href && (
                  <Link
                    href={evidencia.href}
                    className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-marca-600 transition-colors hover:text-marca-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-300"
                  >
                    Abrir utilidad <span className="ml-1" aria-hidden>→</span>
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.05fr_1.95fr]" aria-labelledby="checklist-titulo">
        <div className="superficie rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
            Prioridad de dirección
          </p>
          <h2 id="checklist-titulo" className="mt-1 font-display text-lg font-bold text-tinta">
            Checklist accionable
          </h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Ordena la preparación, pero no reemplaza una auditoría jurídica o técnica independiente.
          </p>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-tinta-suave">Avance de evidencia</span>
              <span className="font-semibold tabular-nums text-tinta">
                {completados}/{centro.checklist.length}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-superficie-3"
              role="progressbar"
              aria-label="Avance del checklist de cumplimiento"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={centro.resumen.avanceChecklist}
            >
              <div
                className="h-full rounded-full bg-marca-600"
                style={{ width: `${centro.resumen.avanceChecklist}%` }}
              />
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-alerta/25 bg-alerta-suave p-3 text-sm text-alerta">
            <p className="font-semibold">Antes del piloto</p>
            <p className="mt-1 leading-relaxed">
              Prioriza RBD, validación EDE, firma oficial, restauración y solicitudes de privacidad vencidas.
            </p>
          </div>
        </div>

        <ol className="superficie overflow-hidden rounded-xl">
          {centro.checklist.map((item, indice) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 border-b border-borde px-4 py-4 last:border-0 sm:flex-row sm:items-start"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  item.completado
                    ? "bg-exito-suave text-exito"
                    : "bg-superficie-3 text-tinta-suave"
                }`}
                aria-hidden
              >
                {item.completado ? "✓" : indice + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-tinta">{item.titulo}</h3>
                  <Insignia
                    tono={
                      item.completado
                        ? "exito"
                        : item.prioridad === "alta"
                          ? "peligro"
                          : "alerta"
                    }
                  >
                    {item.completado
                      ? "Evidencia disponible"
                      : `Prioridad ${item.prioridad}`}
                  </Insignia>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-tinta-suave">{item.detalle}</p>
              </div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-borde-fuerte bg-superficie px-3 text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-300"
                >
                  {item.accion}
                </Link>
              ) : (
                <span className="inline-flex min-h-10 shrink-0 items-center text-sm font-medium text-tinta-tenue">
                  {item.accion}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8" aria-labelledby="exportaciones-titulo">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="exportaciones-titulo" className="font-display text-lg font-bold text-tinta">
              Ejecuciones EDE recientes
            </h2>
            <p className="mt-0.5 text-sm text-tinta-suave">
              Metadatos técnicos mínimos; los archivos cifrados no se exponen en este tablero.
            </p>
          </div>
          <Link
            href="/admin/exportaciones"
            className="inline-flex min-h-10 items-center rounded-lg border border-borde-fuerte bg-superficie px-3 text-sm font-semibold text-tinta transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-300"
          >
            Ver utilidades de exportación
          </Link>
        </div>

        {centro.exportaciones.length === 0 ? (
          <EstadoVacio
            icono="escudo"
            titulo="Sin ejecuciones EDE registradas"
            descripcion="Prepara primero los datos del periodo. El centro mostrará aquí estado, cifrado, hash y validación sin revelar información de estudiantes."
            accion={{ href: "/admin/exportaciones", etiqueta: "Revisar exportaciones" }}
          />
        ) : (
          <div className="superficie overflow-hidden rounded-xl">
            <div className="grid gap-3 p-3 md:hidden">
              {centro.exportaciones.map((exportacion) => {
                const estado = ESTADO_EDE[exportacion.estado] ?? {
                  etiqueta: exportacion.estado,
                  tono: "neutra" as const,
                };
                return (
                  <article key={exportacion.id} className="rounded-lg border border-borde bg-superficie-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-tinta">Año escolar {exportacion.anio}</p>
                        <p className="mt-0.5 text-xs text-tinta-tenue">
                          {formatearFecha(exportacion.creadaEn)}
                        </p>
                      </div>
                      <Insignia tono={estado.tono} punto>{estado.etiqueta}</Insignia>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div><dt className="text-tinta-tenue">Versión</dt><dd className="font-medium text-tinta">{exportacion.versionEde ?? "No informada"}</dd></div>
                      <div><dt className="text-tinta-tenue">Artefactos</dt><dd className="font-medium text-tinta">{exportacion.artefactos}</dd></div>
                      <div><dt className="text-tinta-tenue">Protección</dt><dd className="font-medium text-tinta">{exportacion.cifrado ? "Cifrado" : "No acreditada"}</dd></div>
                      <div><dt className="text-tinta-tenue">Tamaño</dt><dd className="font-medium text-tinta">{formatearTamano(exportacion.tamanoBytes)}</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-borde bg-superficie-2 text-xs uppercase tracking-wide text-tinta-tenue">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ejecución</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Versiones</th>
                    <th className="px-4 py-3 font-semibold">Integridad</th>
                    <th className="px-4 py-3 font-semibold">Artefactos</th>
                    <th className="px-4 py-3 font-semibold">Validación</th>
                  </tr>
                </thead>
                <tbody>
                  {centro.exportaciones.map((exportacion) => {
                    const estado = ESTADO_EDE[exportacion.estado] ?? {
                      etiqueta: exportacion.estado,
                      tono: "neutra" as const,
                    };
                    return (
                      <tr key={exportacion.id} className="border-b border-borde/60 last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-tinta">Año {exportacion.anio}</p>
                          <p className="text-xs tabular-nums text-tinta-tenue">{formatearFecha(exportacion.creadaEn)}</p>
                        </td>
                        <td className="px-4 py-3"><Insignia tono={estado.tono} punto>{estado.etiqueta}</Insignia></td>
                        <td className="px-4 py-3 text-tinta-suave">
                          <p>EDE {exportacion.versionEde ?? "—"}</p>
                          <p className="text-xs">CEDS {exportacion.versionCeds ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-tinta-suave">
                          <p>{exportacion.cifrado ? "Cifrado" : "Cifrado no acreditado"}</p>
                          <p className="text-xs">{exportacion.tieneHash ? "Hash registrado" : "Sin hash"} · {formatearTamano(exportacion.tamanoBytes)}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-tinta-suave">{exportacion.artefactos}</td>
                        <td className="px-4 py-3 text-tinta-suave">
                          {exportacion.validadoEn ? formatearFecha(exportacion.validadoEn) : "Pendiente"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-tinta-tenue">
          “Validación registrada” describe evidencia guardada por una ejecución; no implica certificación,
          homologación ni autorización para operar como libro de clases digital.
        </p>
      </section>
    </div>
  );
}
