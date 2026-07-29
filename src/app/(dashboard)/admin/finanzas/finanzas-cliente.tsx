"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { formatCLP, type EstadoCuota } from "@/lib/finanzas";
import { configurarPlan, generarCuotasCurso, registrarPagoManual } from "./actions";
import { Boton } from "@/components/ui/boton";

const campo = "mt-1 rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";

const CLS_ESTADO: Record<EstadoCuota, string> = {
  PAGADA: "bg-exito-suave text-exito",
  PENDIENTE: "bg-superficie-3 text-tinta-suave",
  VENCIDA: "bg-peligro-suave text-peligro",
  ANULADA: "bg-superficie-3 text-tinta-tenue",
};

export function PlanForm({ anio, plan }: { anio: number; plan: { matricula: number; arancelAnual: number; cuotas: number } | null }) {
  const router = useRouter();
  const [matricula, setMatricula] = useState(plan?.matricula ?? 0);
  const [arancelAnual, setArancelAnual] = useState(plan?.arancelAnual ?? 0);
  const [cuotas, setCuotas] = useState(plan?.cuotas ?? 10);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setMsg(null);
    const res = await configurarPlan({ anio, matricula, arancelAnual, cuotas });
    setOcupado(false);
    if (res.ok) { setMsg("Plan guardado."); router.refresh(); } else setMsg(res.error);
  }

  return (
    <form onSubmit={guardar} className="superficie mt-5 flex flex-wrap items-end gap-3 rounded-xl p-4">
      <p className="w-full text-sm font-semibold text-tinta">Plan de cobro {anio}</p>
      <label className="text-xs font-medium text-tinta-tenue">Matrícula (CLP)
        <input type="number" min={0} value={matricula} onChange={(e) => setMatricula(Number(e.target.value))} className={`${campo} block w-36`} />
      </label>
      <label className="text-xs font-medium text-tinta-tenue">Arancel anual (CLP)
        <input type="number" min={0} value={arancelAnual} onChange={(e) => setArancelAnual(Number(e.target.value))} className={`${campo} block w-40`} />
      </label>
      <label className="text-xs font-medium text-tinta-tenue">N° cuotas
        <input type="number" min={1} max={12} value={cuotas} onChange={(e) => setCuotas(Number(e.target.value))} className={`${campo} block w-24`} />
      </label>
      <Boton type="submit" disabled={ocupado}>Guardar plan</Boton>
      {msg && <span className="text-sm text-tinta-suave">{msg}</span>}
    </form>
  );
}

type Cuota = { id: string; nombre: string; concepto: string; numero: number; monto: number; vencISO: string; estado: EstadoCuota };

export function CuotasCurso({ cursoId, anio, cuotas, tienePlan }: { cursoId: string; anio: number; cuotas: Cuota[]; tienePlan: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generar() {
    setOcupado(true); setMsg(null);
    const res = await generarCuotasCurso(cursoId, anio);
    setOcupado(false);
    if (res.ok) { setMsg(`${res.n} cuota(s) generada(s).`); router.refresh(); } else setMsg(res.error);
  }

  async function pagar(cuotaId: string) {
    const medio = window.prompt("Medio de pago: EFECTIVO, TRANSFERENCIA, TARJETA u OTRO", "EFECTIVO");
    if (!medio) return;
    const ref = window.prompt("Referencia (folio/comprobante, opcional):", "") ?? "";
    const res = await registrarPagoManual({ cuotaId, medio: medio.toUpperCase(), referencia: ref });
    if (res.ok) router.refresh(); else toast.error(res.error);
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <Boton type="button" onClick={generar} disabled={ocupado || !tienePlan}>
          {ocupado ? "Generando…" : "Generar cuotas del plan"}
        </Boton>
        {!tienePlan && <span className="text-xs text-tinta-tenue">Configura el plan primero.</span>}
        {msg && <span className="text-sm text-tinta-suave">{msg}</span>}
      </div>

      {cuotas.length > 0 && (
        <div className="mt-3 space-y-2">
          {agruparPorEstudiante(cuotas).map((grupo) => {
            const total = grupo.cuotas.reduce((s, c) => s + c.monto, 0);
            const pagadas = grupo.cuotas.filter((c) => c.estado === "PAGADA").length;
            const pendientes = grupo.cuotas.filter(
              (c) => c.estado === "PENDIENTE" || c.estado === "VENCIDA"
            );
            const alDia = pendientes.length === 0;
            return (
              <details key={grupo.nombre} className="superficie overflow-hidden rounded-xl">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-semibold text-tinta">{grupo.nombre}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-tinta-suave">{formatCLP(total)}</span>
                    <span className="tabular-nums text-tinta-tenue">
                      {pagadas}/{grupo.cuotas.length} pagadas
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-semibold ${alDia ? "bg-exito-suave text-exito" : "bg-peligro-suave text-peligro"}`}
                    >
                      {alDia ? "Al día" : `${pendientes.length} por pagar`}
                    </span>
                  </span>
                </summary>
                <div className="overflow-x-auto border-t border-borde">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {grupo.cuotas.map((c) => (
                        <tr key={c.id} className="border-b border-borde/60 last:border-0">
                          <td className="px-4 py-2 text-tinta-suave">{c.concepto === "MATRICULA" ? "Matrícula" : `Cuota ${c.numero}`}</td>
                          <td className="px-4 py-2 tabular-nums text-tinta">{formatCLP(c.monto)}</td>
                          <td className="px-4 py-2 tabular-nums text-tinta-tenue">{c.vencISO}</td>
                          <td className="px-4 py-2">
                            <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${CLS_ESTADO[c.estado]}`}>{c.estado}</span>
                          </td>
                          <td className="px-4 py-2">
                            {c.estado !== "PAGADA" && c.estado !== "ANULADA" && (
                              <button type="button" onClick={() => pagar(c.id)} className="text-sm font-medium text-marca-600 hover:text-marca-700">Registrar pago</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Agrupa las cuotas por estudiante preservando el orden (ya viene por apellido). */
function agruparPorEstudiante(cuotas: Cuota[]): { nombre: string; cuotas: Cuota[] }[] {
  const orden: string[] = [];
  const mapa = new Map<string, Cuota[]>();
  for (const c of cuotas) {
    if (!mapa.has(c.nombre)) {
      mapa.set(c.nombre, []);
      orden.push(c.nombre);
    }
    mapa.get(c.nombre)!.push(c);
  }
  return orden.map((nombre) => ({ nombre, cuotas: mapa.get(nombre)! }));
}
