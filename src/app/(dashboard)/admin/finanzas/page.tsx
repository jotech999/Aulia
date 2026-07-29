import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { formatCLP, estadoEfectivo, type EstadoCuota } from "@/lib/finanzas";
import { hoyEnSantiago, isoDesdeFecha } from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { BotonEnlace } from "@/components/ui/boton";
import { PlanForm, CuotasCurso } from "./finanzas-cliente";
import { RecordatoriosCuotas } from "./recordatorios-cliente";
import { ordenarCursos } from "@/lib/cursos";

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string; anio?: string }>;
}) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const hoy = hoyEnSantiago();
  const anio = Number(sp.anio) || Number(hoy.slice(0, 4));

  const [plan, cursos] = await Promise.all([
    prisma.planCobro.findUnique({ where: { colegioId_anio: { colegioId: user.colegioId, anio } } }),
    prisma.curso.findMany({ where: { colegioId: user.colegioId }, orderBy: [{ nivel: "asc" }, { letra: "asc" }], select: { id: true, nivel: true, letra: true } }),
  ]);

  const cursoSel = sp.cursoId ? cursos.find((c) => c.id === sp.cursoId) : undefined;

  // Resumen de recaudación del colegio.
  const [recaudado, porCobrar] = await Promise.all([
    prisma.cuota.aggregate({ where: { colegioId: user.colegioId, estado: "PAGADA" }, _sum: { monto: true } }),
    prisma.cuota.aggregate({ where: { colegioId: user.colegioId, estado: { in: ["PENDIENTE", "VENCIDA"] } }, _sum: { monto: true } }),
  ]);

  let cuotas: { id: string; nombre: string; concepto: string; numero: number; monto: number; vencISO: string; estado: EstadoCuota }[] = [];
  if (cursoSel) {
    const rows = await prisma.cuota.findMany({
      where: { colegioId: user.colegioId, anio, estudiante: { matriculas: { some: { cursoId: cursoSel.id, estado: "ACTIVA" } } } },
      orderBy: [{ estudiante: { apellidos: "asc" } }, { concepto: "asc" }, { numero: "asc" }],
      select: { id: true, concepto: true, numero: true, monto: true, vencimiento: true, estado: true, estudiante: { select: { nombres: true, apellidos: true } } },
    });
    cuotas = rows.map((c) => ({
      id: c.id,
      nombre: `${c.estudiante.apellidos}, ${c.estudiante.nombres}`,
      concepto: c.concepto,
      numero: c.numero,
      monto: c.monto,
      vencISO: isoDesdeFecha(c.vencimiento),
      estado: estadoEfectivo(c.estado as EstadoCuota, isoDesdeFecha(c.vencimiento), hoy),
    }));
  }

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo="Finanzas y cobranza"
        descripcion={`Plan de cobro ${anio}, cuotas por curso y registro de pagos.`}
        acciones={
          <BotonEnlace variante="secundario" tamano="sm" href="/admin/finanzas/morosidad">
            Reporte de morosidad
          </BotonEnlace>
        }
      />

      <RecordatoriosCuotas />

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="superficie acento-superior rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Recaudado</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-exito">{formatCLP(recaudado._sum.monto ?? 0)}</p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Por cobrar</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-tinta">{formatCLP(porCobrar._sum.monto ?? 0)}</p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-sm text-tinta-suave">Plan {anio}</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-tinta">{plan ? `${plan.cuotas} cuotas` : "Sin configurar"}</p>
        </div>
      </section>

      <PlanForm anio={anio} plan={plan ? { matricula: plan.matricula, arancelAnual: plan.arancelAnual, cuotas: plan.cuotas } : null} />

      {/* Selector de curso */}
      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">Cuotas por curso</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ordenarCursos(cursos).map((c) => (
            <Link
              key={c.id}
              href={`/admin/finanzas?cursoId=${c.id}&anio=${anio}`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${cursoSel?.id === c.id ? "border-marca-600 bg-marca-50 text-marca-700" : "border-borde bg-superficie text-tinta-suave hover:bg-superficie-2"}`}
            >
              {c.nivel} {c.letra}
            </Link>
          ))}
        </div>

        {cursoSel && <CuotasCurso cursoId={cursoSel.id} anio={anio} cuotas={cuotas} tienePlan={!!plan} />}
      </section>
    </div>
  );
}
