import { requerirRol } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { metricasRed } from "@/lib/sostenedor";

export const metadata = { title: "Panel del sostenedor" };

const fmtPct = (v: number | null) => (v == null ? "—" : `${v}%`);
const fmtNota = (v: number | null) => (v == null ? "—" : v.toFixed(1));

function colorAsistencia(v: number | null) {
  if (v == null) return "text-tinta-tenue";
  if (v >= 90) return "text-exito";
  if (v >= 85) return "text-ambar-600";
  return "text-peligro";
}

export default async function Page() {
  const { user } = await requerirRol("SOSTENEDOR");

  // Multi-tenant: SOLO los colegios donde este usuario tiene membresía SOSTENEDOR.
  // Nunca se consultan "todos los colegios" de la base.
  const membresias = await prisma.membresia.findMany({
    where: { usuarioId: user.id, rol: "SOSTENEDOR" },
    select: { colegioId: true },
  });
  const colegioIds = membresias.map((m) => m.colegioId);
  const metricas = await metricasRed(colegioIds);

  // Totales de la red (suma / ponderado) para la lectura ejecutiva.
  const totalEstudiantes = metricas.reduce((s, m) => s + m.estudiantes, 0);
  const totalIntervenciones = metricas.reduce((s, m) => s + m.intervencionesAbiertas, 0);
  const conAsistencia = metricas.filter((m) => m.asistenciaMedia != null);
  const asistenciaRed = conAsistencia.length
    ? Math.round(conAsistencia.reduce((s, m) => s + (m.asistenciaMedia ?? 0), 0) / conAsistencia.length)
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-marca-600">Sostenedor</p>
        <h1 className="font-display text-2xl font-bold text-tinta">Panel de la red</h1>
        <p className="mt-1 max-w-2xl text-sm text-tinta-suave">
          Comparativa de solo lectura entre tus colegios. Indicadores agregados por establecimiento;
          para el detalle, ingresa al colegio con el rol correspondiente.
        </p>
      </header>

      {metricas.length === 0 ? (
        <div className="rounded-xl border border-borde bg-superficie px-5 py-8 text-center text-sm text-tinta-suave">
          Aún no tienes colegios asociados a tu cuenta de sostenedor.
        </div>
      ) : (
        <>
          {/* Resumen de la red */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { etiqueta: "Colegios", valor: String(metricas.length) },
              { etiqueta: "Estudiantes", valor: totalEstudiantes.toLocaleString("es-CL") },
              { etiqueta: "Asistencia media", valor: fmtPct(asistenciaRed) },
              { etiqueta: "Intervenciones abiertas", valor: String(totalIntervenciones) },
            ].map((k) => (
              <div key={k.etiqueta} className="rounded-xl border border-borde bg-superficie p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">{k.etiqueta}</p>
                <p className="mt-1 font-display text-2xl font-bold text-tinta">{k.valor}</p>
              </div>
            ))}
          </div>

          {/* Tabla comparativa */}
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-borde bg-superficie-2">
                <tr>
                  <th className="px-4 py-3 font-semibold text-tinta-tenue">Colegio</th>
                  <th className="px-4 py-3 text-right font-semibold text-tinta-tenue">Estudiantes</th>
                  <th className="px-4 py-3 text-right font-semibold text-tinta-tenue">Asistencia</th>
                  <th className="px-4 py-3 text-right font-semibold text-tinta-tenue">Promedio</th>
                  <th className="px-4 py-3 text-right font-semibold text-tinta-tenue">Intervenciones</th>
                  <th className="px-4 py-3 text-right font-semibold text-tinta-tenue">Recaudación</th>
                </tr>
              </thead>
              <tbody>
                {metricas.map((m) => (
                  <tr key={m.colegioId} className="border-t border-borde">
                    <td className="px-4 py-3 font-medium text-tinta">{m.nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-tinta">{m.estudiantes.toLocaleString("es-CL")}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${colorAsistencia(m.asistenciaMedia)}`}>
                      {fmtPct(m.asistenciaMedia)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-tinta">{fmtNota(m.promedioGeneral)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-tinta">
                      {m.intervencionesAbiertas > 0 ? (
                        <span className="rounded-full bg-ambar-100 px-2 py-0.5 text-xs font-semibold text-ambar-700">{m.intervencionesAbiertas}</span>
                      ) : (
                        <span className="text-tinta-tenue">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-tinta">{fmtPct(m.recaudacionPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-tinta-tenue">
            Recaudación: porcentaje del arancel del año cobrado (cuotas pagadas sobre el total emitido).
            {conAsistencia.length < metricas.length && " Algunos colegios aún no registran asistencia."}
          </p>
        </>
      )}
    </div>
  );
}
