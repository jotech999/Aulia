import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { formatCLP, estadoEfectivo, type EstadoCuota } from "@/lib/finanzas";
import { hoyEnSantiago, isoDesdeFecha } from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Avatar } from "@/components/ui/avatar";
import { PagarWebpay } from "./pagar-cliente";

export default async function MiCuentaPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const { user } = await requerirRol("APODERADO");
  const sp = await searchParams;
  const hoy = hoyEnSantiago();

  const pupilos = await prisma.estudiante.findMany({
    where: { colegioId: user.colegioId, apoderados: { some: { usuarioId: user.id } } },
    orderBy: { apellidos: "asc" },
    select: {
      id: true, nombres: true, apellidos: true,
      // Cuotas de finanzas del pupilo.
    },
  });
  const pupiloIds = pupilos.map((p) => p.id);
  const cuotas = pupiloIds.length
    ? await prisma.cuota.findMany({
        where: { colegioId: user.colegioId, estudianteId: { in: pupiloIds } },
        orderBy: [{ concepto: "asc" }, { numero: "asc" }],
        select: { id: true, estudianteId: true, concepto: true, numero: true, monto: true, vencimiento: true, estado: true },
      })
    : [];

  const porPupilo = new Map<string, typeof cuotas>();
  for (const c of cuotas) (porPupilo.get(c.estudianteId) ?? porPupilo.set(c.estudianteId, []).get(c.estudianteId)!).push(c);

  const banner =
    sp.pago === "ok" ? { txt: "¡Pago realizado con éxito! Gracias.", cls: "border-exito/20 bg-exito-suave text-exito" }
    : sp.pago === "duplicado" ? { txt: "El pago se registró, pero la cuota ya estaba pagada. El colegio revisará un posible reverso.", cls: "border-alerta/20 bg-alerta-suave text-alerta" }
    : sp.pago === "rechazado" ? { txt: "El pago fue rechazado. Intenta con otro medio.", cls: "border-peligro/20 bg-peligro-suave text-peligro" }
    : sp.pago === "cancelado" ? { txt: "Cancelaste el pago.", cls: "border-alerta/20 bg-alerta-suave text-alerta" }
    : sp.pago ? { txt: "No se pudo procesar el pago.", cls: "border-peligro/20 bg-peligro-suave text-peligro" }
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina icono="calificaciones" titulo="Estado de cuenta" descripcion="Cuotas y pagos de tus pupilos." />

      {banner && <p className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${banner.cls}`}>{banner.txt}</p>}

      {cuotas.length === 0 ? (
        <p className="superficie mt-5 rounded-xl px-5 py-8 text-center text-sm text-tinta-suave">
          No hay cuotas registradas. Cuando el colegio configure la cobranza, aquí verás tu estado de cuenta.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {pupilos.map((p) => {
            const cs = (porPupilo.get(p.id) ?? []).map((c) => ({
              ...c,
              vencISO: isoDesdeFecha(c.vencimiento),
              estadoEf: estadoEfectivo(c.estado as EstadoCuota, isoDesdeFecha(c.vencimiento), hoy),
            }));
            const adeudado = cs.filter((c) => c.estadoEf !== "PAGADA" && c.estadoEf !== "ANULADA").reduce((s, c) => s + c.monto, 0);
            if (cs.length === 0) return null;
            return (
              <section key={p.id} className="superficie rounded-xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar nombres={p.nombres} apellidos={p.apellidos} tamano="sm" />
                    <p className="font-semibold text-tinta">{p.nombres} {p.apellidos}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-tinta-tenue">Por pagar</p>
                    <p className={`font-display text-lg font-bold tabular-nums ${adeudado > 0 ? "text-tinta" : "text-exito"}`}>{formatCLP(adeudado)}</p>
                  </div>
                </div>
                <ul className="mt-3 divide-y divide-borde/60">
                  {cs.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-tinta">{c.concepto === "MATRICULA" ? "Matrícula" : `Cuota ${c.numero}`}</p>
                        <p className="text-xs text-tinta-tenue">Vence {c.vencISO} · {formatCLP(c.monto)}</p>
                      </div>
                      {c.estadoEf === "PAGADA" ? (
                        <span className="rounded-md bg-exito-suave px-2 py-0.5 text-xs font-semibold text-exito">Pagada</span>
                      ) : c.estadoEf === "VENCIDA" ? (
                        <PagarWebpay cuotaId={c.id} etiqueta="Pagar (vencida)" peligro />
                      ) : (
                        <PagarWebpay cuotaId={c.id} etiqueta="Pagar" />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-center text-xs text-tinta-tenue">Pagos procesados de forma segura por Webpay (Transbank).</p>
    </div>
  );
}
