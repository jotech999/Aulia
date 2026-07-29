/**
 * Dominio de finanzas/cobranza. Lógica pura y helpers de presentación.
 * Montos en pesos chilenos (CLP) sin decimales.
 */

export function puedeGestionarFinanzas(rol: string): boolean {
  return rol === "ADMIN" || rol === "DIRECTOR";
}

/** Formatea un monto CLP: 350000 → "$350.000". */
export function formatCLP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export type EstadoCuota = "PENDIENTE" | "PAGADA" | "VENCIDA" | "ANULADA";

/** Estado efectivo de una cuota: PENDIENTE con vencimiento pasado ⇒ VENCIDA. */
export function estadoEfectivo(
  estado: EstadoCuota,
  vencimientoISO: string,
  hoyISO: string
): EstadoCuota {
  if (estado === "PAGADA" || estado === "ANULADA") return estado;
  return vencimientoISO < hoyISO ? "VENCIDA" : "PENDIENTE";
}

/**
 * Genera el calendario de cuotas de un estudiante para un plan de cobro:
 * una cuota de matrícula (vence en marzo) y N mensualidades (marzo..).
 * Devuelve montos y fechas; el estado inicial es PENDIENTE.
 */
export function generarCuotasPlan(
  plan: { anio: number; matricula: number; arancelAnual: number; cuotas: number }
): { concepto: "MATRICULA" | "MENSUALIDAD"; numero: number; monto: number; vencimientoISO: string }[] {
  const out: { concepto: "MATRICULA" | "MENSUALIDAD"; numero: number; monto: number; vencimientoISO: string }[] = [];
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (plan.matricula > 0) {
    out.push({ concepto: "MATRICULA", numero: 0, monto: plan.matricula, vencimientoISO: iso(plan.anio, 3, 10) });
  }
  const n = Math.max(plan.cuotas, 1);
  const base = Math.floor(plan.arancelAnual / n);
  const resto = plan.arancelAnual - base * n; // se suma a la primera cuota
  for (let i = 0; i < n; i++) {
    const mes = 3 + i; // marzo en adelante
    const anio = plan.anio + Math.floor((mes - 1) / 12);
    const mesReal = ((mes - 1) % 12) + 1;
    out.push({
      concepto: "MENSUALIDAD",
      numero: i + 1,
      monto: i === 0 ? base + resto : base,
      vencimientoISO: iso(anio, mesReal, 5),
    });
  }
  return out;
}
