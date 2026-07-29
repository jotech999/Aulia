/**
 * Feriados legales de Chile — datos de REFERENCIA (no multi-tenant, iguales para
 * todos los colegios). Fechas verificadas para 2026, con los movibles ya
 * resueltos: Semana Santa, San Pedro y San Pablo, Día de los Pueblos Indígenas
 * (Ley 21.357, solsticio), Encuentro de Dos Mundos e Iglesias Evangélicas.
 * Fuente: feriadoslegales.cl (jul 2026). Al operar en otro año, agregar el
 * listado verificado de ese año (los movibles cambian de fecha).
 *
 * Uso escolar: marcar el calendario y —a futuro— excluir de días hábiles (SIGE).
 */
export const FERIADOS_CL: Record<string, string> = {
  "2026-01-01": "Año Nuevo",
  "2026-04-03": "Viernes Santo",
  "2026-04-04": "Sábado Santo",
  "2026-05-01": "Día del Trabajo",
  "2026-05-21": "Glorias Navales",
  "2026-06-21": "Día de los Pueblos Indígenas",
  "2026-06-29": "San Pedro y San Pablo",
  "2026-07-16": "Virgen del Carmen",
  "2026-08-15": "Asunción de la Virgen",
  "2026-09-18": "Independencia Nacional",
  "2026-09-19": "Glorias del Ejército",
  "2026-10-12": "Encuentro de Dos Mundos",
  "2026-10-31": "Iglesias Evangélicas",
  "2026-11-01": "Todos los Santos",
  "2026-12-08": "Inmaculada Concepción",
  "2026-12-25": "Navidad",
};

/** Nombre del feriado en una fecha ISO "YYYY-MM-DD", o null si es día normal. */
export function feriadoDe(iso: string): string | null {
  return FERIADOS_CL[iso] ?? null;
}

/** ¿La fecha ISO es feriado legal en Chile? */
export function esFeriado(iso: string): boolean {
  return iso in FERIADOS_CL;
}
