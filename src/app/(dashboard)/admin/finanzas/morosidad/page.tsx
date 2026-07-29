import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { formatCLP } from "@/lib/finanzas";
import { hoyEnSantiago, fechaDesdeISO, isoDesdeFecha } from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";

export const metadata = { title: "Morosidad" };

/**
 * Reporte de morosidad para dirección: quién debe, cuánto y hace cuánto.
 * Solo cuotas VENCIDAS impagas de estudiantes con matrícula activa.
 * Dato financiero sensible: acceso restringido a ADMIN/DIRECTOR (mismo perfil
 * que Finanzas) y sin exponer más PII que nombre y curso.
 */
export default async function MorosidadPage({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string }>;
}) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const hoy = hoyEnSantiago();
  const hoyDate = fechaDesdeISO(hoy);

  const [cursos, vencidas] = await Promise.all([
    prisma.curso.findMany({
      where: { colegioId: user.colegioId },
      select: { id: true, nivel: true, letra: true },
      orderBy: [{ nivel: "asc" }, { letra: "asc" }],
    }),
    prisma.cuota.findMany({
      where: {
        colegioId: user.colegioId,
        estado: { in: ["PENDIENTE", "VENCIDA"] },
        vencimiento: { lt: hoyDate },
        estudiante: {
          matriculas: {
            some: {
              estado: "ACTIVA",
              ...(sp.cursoId ? { cursoId: sp.cursoId } : {}),
            },
          },
        },
      },
      select: {
        monto: true,
        vencimiento: true,
        recordatorioEnviadoEn: true,
        estudiante: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            matriculas: {
              where: { estado: "ACTIVA" },
              select: { curso: { select: { nivel: true, letra: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: { vencimiento: "asc" },
    }),
  ]);

  // Agregado por estudiante: total adeudado, n° de cuotas y atraso máximo.
  type Fila = {
    id: string;
    nombre: string;
    curso: string;
    total: number;
    cuotas: number;
    diasAtraso: number;
    avisado: boolean;
  };
  const porEstudiante = new Map<string, Fila>();
  for (const c of vencidas) {
    const e = c.estudiante;
    const dias = Math.max(
      0,
      Math.round((hoyDate.getTime() - c.vencimiento.getTime()) / 86_400_000)
    );
    const fila = porEstudiante.get(e.id) ?? {
      id: e.id,
      nombre: `${e.apellidos}, ${e.nombres}`,
      curso: e.matriculas[0]
        ? nombreCurso(e.matriculas[0].curso)
        : "—",
      total: 0,
      cuotas: 0,
      diasAtraso: 0,
      avisado: false,
    };
    fila.total += c.monto;
    fila.cuotas += 1;
    fila.diasAtraso = Math.max(fila.diasAtraso, dias);
    fila.avisado = fila.avisado || c.recordatorioEnviadoEn !== null;
    porEstudiante.set(e.id, fila);
  }
  const filas = [...porEstudiante.values()].sort((a, b) => b.total - a.total);
  const totalMoroso = filas.reduce((s, f) => s + f.total, 0);
  const totalCuotas = filas.reduce((s, f) => s + f.cuotas, 0);

  const cursoSel = sp.cursoId ? cursos.find((c) => c.id === sp.cursoId) : undefined;

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo="Reporte de morosidad"
        descripcion={`Cuotas vencidas impagas al ${isoDesdeFecha(hoyDate)} · información reservada de dirección`}
        volver={{ href: "/admin/finanzas", etiqueta: "Volver a finanzas" }}
      />

      {/* Resumen ejecutivo */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="superficie acento-superior rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Total moroso</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-peligro">
            {formatCLP(totalMoroso)}
          </p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Estudiantes con deuda</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{filas.length}</p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Cuotas vencidas</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{totalCuotas}</p>
        </div>
      </section>

      {/* Filtro por curso */}
      <div className="mt-5 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por curso">
        <Link
          href="/admin/finanzas/morosidad"
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
            !cursoSel
              ? "border-marca-500 bg-marca-50 text-marca-700"
              : "border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
          }`}
        >
          Todo el colegio
        </Link>
        {ordenarCursos(cursos).map((c) => (
          <Link
            key={c.id}
            href={`/admin/finanzas/morosidad?cursoId=${c.id}`}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              cursoSel?.id === c.id
                ? "border-marca-500 bg-marca-50 text-marca-700"
                : "border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
            }`}
          >
            {nombreCurso(c)}
          </Link>
        ))}
      </div>

      {filas.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-10 text-center">
          <p className="text-2xl" aria-hidden>🎉</p>
          <p className="mt-2 text-sm font-semibold text-tinta">Sin morosidad</p>
          <p className="mt-1 text-sm text-tinta-tenue">
            {cursoSel ? "Este curso no tiene cuotas vencidas impagas." : "No hay cuotas vencidas impagas en el colegio."}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borde bg-superficie-2 text-xs uppercase tracking-wide text-tinta-tenue">
              <tr>
                <th className="px-4 py-3">Estudiante</th>
                <th className="px-4 py-3">Curso</th>
                <th className="px-4 py-3 text-right">Cuotas</th>
                <th className="px-4 py-3 text-right">Atraso máx.</th>
                <th className="px-4 py-3 text-center">Avisado</th>
                <th className="px-4 py-3 text-right">Deuda</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-borde last:border-0 transition-colors hover:bg-superficie-2">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/estudiantes/${f.id}`}
                      className="font-medium text-tinta hover:text-marca-600"
                    >
                      {f.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-tinta-suave">{f.curso}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.cuotas}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                        f.diasAtraso > 60
                          ? "bg-peligro-suave text-peligro"
                          : f.diasAtraso > 30
                            ? "bg-alerta-suave text-alerta"
                            : "bg-superficie-3 text-tinta-suave"
                      }`}
                    >
                      {f.diasAtraso} días
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {f.avisado ? (
                      <span className="text-exito" title="Recordatorio enviado al apoderado" aria-label="Avisado">✓</span>
                    ) : (
                      <span className="text-tinta-tenue" title="Sin recordatorio enviado" aria-label="Sin aviso">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-peligro">
                    {formatCLP(f.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-tinta-tenue">
        Atraso sobre 30 días en ámbar, sobre 60 en rojo. Usa "Enviar recordatorios" en Finanzas
        para avisar a los apoderados con cuotas vencidas (máximo un aviso semanal por cuota).
      </p>
    </div>
  );
}
