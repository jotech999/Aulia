import { requerirRol } from "@/lib/sesion";
import { calcularCierreMensual } from "@/lib/cierre-mensual";
import { hoyEnSantiago } from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { SelectorMes } from "./selector-mes";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default async function CierreMensualPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP");
  const sp = await searchParams;
  const hoy = hoyEnSantiago();
  const anio = Number(sp.anio) || Number(hoy.slice(0, 4));
  const mes = Math.min(Math.max(Number(sp.mes) || Number(hoy.slice(5, 7)), 1), 12);

  const cierre = await calcularCierreMensual(user.colegioId, anio, mes);
  const conAtencion = cierre.cursos.filter((c) => c.estado === "atencion").length;
  const listo = conAtencion === 0 && cierre.cursos.some((c) => c.matriculaActiva > 0);

  const colorAsis = (v: number | null) =>
    v === null ? "text-tinta-tenue" : v >= 85 ? "text-exito" : v >= 75 ? "text-alerta" : "text-peligro";

  return (
    <div>
      <EncabezadoPagina
        icono="asistencia"
        titulo="Cierre mensual · declaración SIGE"
        descripcion="Verifica que el mes esté completo antes de declarar asistencia y matrícula en SIGE."
        acciones={<SelectorMes anio={anio} mes={mes} />}
      />

      {/* Resumen del mes */}
      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={`superficie rounded-xl p-4 ${listo ? "acento-superior" : ""}`}>
          <p className="text-sm text-tinta-suave">Estado del cierre</p>
          {listo ? (
            <p className="mt-1 font-display text-xl font-bold text-exito">Listo para declarar</p>
          ) : (
            <p className="mt-1 font-display text-xl font-bold text-alerta">{conAtencion} curso(s) por revisar</p>
          )}
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Mes</p>
          <p className="mt-1 font-display text-xl font-bold text-tinta">{MESES[mes - 1]} {anio}</p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Días hábiles</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-tinta">
            {cierre.diasHabilesTranscurridos}<span className="text-sm font-normal text-tinta-tenue"> / {cierre.diasHabilesMes}</span>
          </p>
          <p className="mt-0.5 text-xs text-tinta-tenue">transcurridos / del mes</p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Cursos</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-tinta">{cierre.cursos.length}</p>
        </div>
      </section>

      {/* Tabla por curso */}
      <div className="superficie mt-6 overflow-x-auto rounded-xl">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-borde bg-superficie-2 text-xs uppercase tracking-wide text-tinta-tenue">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Curso</th>
              <th className="px-4 py-2.5 font-semibold">Matrícula</th>
              <th className="px-4 py-2.5 font-semibold">Asistencia media</th>
              <th className="px-4 py-2.5 font-semibold">Días s/ asistencia</th>
              <th className="px-4 py-2.5 font-semibold">Clases s/ firmar</th>
              <th className="px-4 py-2.5 font-semibold">Estado</th>
              <th className="px-4 py-2.5 font-semibold">Planilla</th>
            </tr>
          </thead>
          <tbody>
            {cierre.cursos.map((c) => (
              <tr key={c.cursoId} className="border-b border-borde/60 last:border-0 align-top">
                <td className="px-4 py-3 font-semibold text-tinta">{c.nivel} {c.letra}</td>
                <td className="px-4 py-3 tabular-nums text-tinta-suave">{c.matriculaActiva}</td>
                <td className={`px-4 py-3 font-display text-base font-bold tabular-nums ${colorAsis(c.asistenciaMedia)}`}>
                  {c.asistenciaMedia === null ? "—" : `${c.asistenciaMedia}%`}
                </td>
                <td className={`px-4 py-3 tabular-nums ${c.diasSinAsistencia > 0 ? "font-semibold text-peligro" : "text-tinta-suave"}`}>
                  {c.diasSinAsistencia}
                </td>
                <td className={`px-4 py-3 tabular-nums ${c.clasesSinFirmar > 0 ? "font-semibold text-alerta" : "text-tinta-suave"}`}>
                  {c.clasesSinFirmar}
                </td>
                <td className="px-4 py-3">
                  {c.estado === "ok" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-exito-suave px-2 py-0.5 text-xs font-semibold text-exito">
                      <span aria-hidden>✓</span> Completo
                    </span>
                  ) : (
                    <div className="space-y-1">
                      {c.alertas.map((a, i) => (
                        <span key={i} className="block rounded-md bg-alerta-suave px-2 py-0.5 text-xs font-medium text-alerta">{a}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/api/exportar/asistencia-mensual?cursoId=${c.cursoId}&anio=${anio}&mes=${mes}`}
                    className="text-sm font-medium text-marca-600 hover:text-marca-700"
                  >
                    Descargar
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-tinta-tenue">
        La asistencia media es el número que alimenta la subvención. Debe cuadrar con el libro de clases
        (Circular N°30). SIGE no importa archivos de asistencia: usa esta planilla para transcribir en el
        portal (ayudamineduc.cl · Declaración de asistencia) con respaldo auditable.
      </p>
    </div>
  );
}
