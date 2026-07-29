/**
 * Presentación de los estados de asistencia (colores, íconos, etiquetas).
 * Constante pura reutilizable por Server y Client Components.
 * Accesibilidad: cada estado lleva ícono + abreviatura, nunca solo color.
 */
import type { EstadoAsistencia } from "@/lib/asistencia";
import { ESTADOS_ASISTENCIA } from "@/lib/asistencia";

export const ESTADOS_UI: Record<
  EstadoAsistencia,
  {
    label: string;
    icono: string;
    abrev: string;
    fila: string; // fila de la lista diaria (texto sobre fondo claro)
    celda: string; // badge / celda de la grilla mensual
    texto: string; // texto de color para contadores
  }
> = {
  PRESENTE: {
    label: "Presente",
    icono: "✓",
    abrev: "P",
    fila: "bg-emerald-50 border-emerald-200 text-emerald-800",
    celda: "bg-emerald-500 text-white",
    texto: "text-emerald-700",
  },
  AUSENTE: {
    label: "Ausente",
    icono: "✕",
    abrev: "A",
    fila: "bg-red-50 border-red-200 text-red-800",
    celda: "bg-red-500 text-white",
    texto: "text-red-700",
  },
  ATRASADO: {
    label: "Atrasado",
    icono: "◔",
    abrev: "T",
    fila: "bg-amber-50 border-amber-200 text-amber-800",
    celda: "bg-amber-500 text-white",
    texto: "text-amber-700",
  },
  RETIRADO: {
    label: "Retirado",
    icono: "→",
    abrev: "R",
    fila: "bg-violet-50 border-violet-200 text-violet-800",
    celda: "bg-violet-500 text-white",
    texto: "text-violet-700",
  },
};

/** Orden en que el toque cicla los estados. */
export const ORDEN_CICLO = ESTADOS_ASISTENCIA;

export function siguienteEstado(actual: EstadoAsistencia): EstadoAsistencia {
  const i = ORDEN_CICLO.indexOf(actual);
  return ORDEN_CICLO[(i + 1) % ORDEN_CICLO.length];
}
