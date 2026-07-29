import { rangoMes, isoDesdeFecha } from "./fecha";

/**
 * Construcción pura de la grilla mensual del calendario escolar (semana que
 * empieza el lunes, como en Chile). Rellena con días del mes anterior/siguiente
 * para completar semanas de 7. Todo en día-solo UTC, sin desfases de zona.
 */

export type CeldaMes = { iso: string; dia: number; delMes: boolean };

export const NOMBRE_DIA_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Semanas del mes "YYYY-MM": cada una con 7 celdas (lunes → domingo). */
export function construirMes(mesISO: string): CeldaMes[][] {
  const { dias } = rangoMes(mesISO);
  const [anio, m] = mesISO.split("-").map(Number);

  const primero = new Date(Date.UTC(anio, m - 1, 1));
  const dowPrimero = primero.getUTCDay() === 0 ? 7 : primero.getUTCDay(); // 1=lun … 7=dom
  const relleno = dowPrimero - 1;

  const celdas: CeldaMes[] = [];
  // Cola del mes anterior para alinear el primer lunes.
  for (let i = relleno; i > 0; i--) {
    const d = new Date(Date.UTC(anio, m - 1, 1 - i));
    celdas.push({ iso: isoDesdeFecha(d), dia: d.getUTCDate(), delMes: false });
  }
  // Días del mes.
  for (const d of dias) celdas.push({ iso: d.iso, dia: d.dia, delMes: true });
  // Cabeza del mes siguiente hasta completar la última semana.
  while (celdas.length % 7 !== 0) {
    const [ly, lm, ld] = celdas[celdas.length - 1].iso.split("-").map(Number);
    const d = new Date(Date.UTC(ly, lm - 1, ld + 1));
    celdas.push({ iso: isoDesdeFecha(d), dia: d.getUTCDate(), delMes: false });
  }

  const semanas: CeldaMes[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

/** Mes anterior / siguiente de "YYYY-MM" (para navegar el calendario). */
export function mesVecino(mesISO: string, delta: -1 | 1): string {
  const [anio, m] = mesISO.split("-").map(Number);
  const d = new Date(Date.UTC(anio, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type TipoEventoVista =
  | "GENERAL"
  | "REUNION"
  | "EVALUACION"
  | "EFEMERIDE"
  | "SUSPENSION"
  | "FERIADO";

/** Color y etiqueta por tipo de evento (clases Tailwind literales). */
export const ESTILO_EVENTO: Record<TipoEventoVista, { etiqueta: string; punto: string; suave: string }> = {
  GENERAL: { etiqueta: "General", punto: "bg-slate-500", suave: "bg-slate-100 text-slate-700" },
  REUNION: { etiqueta: "Reunión", punto: "bg-blue-500", suave: "bg-blue-50 text-blue-700" },
  EVALUACION: { etiqueta: "Evaluación", punto: "bg-red-500", suave: "bg-red-50 text-red-700" },
  EFEMERIDE: { etiqueta: "Efeméride", punto: "bg-violet-500", suave: "bg-violet-50 text-violet-700" },
  SUSPENSION: { etiqueta: "Suspensión", punto: "bg-amber-500", suave: "bg-amber-50 text-amber-700" },
  FERIADO: { etiqueta: "Feriado", punto: "bg-emerald-500", suave: "bg-emerald-50 text-emerald-700" },
};
