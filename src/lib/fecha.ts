/**
 * Utilidades de fecha escolar en zona horaria de Chile.
 *
 * Regla del proyecto (CLAUDE.md §4): toda la lógica de fechas escolares usa
 * `America/Santiago`. La asistencia se registra por día calendario chileno,
 * NUNCA por la fecha UTC del servidor ni por la del navegador del profesor.
 *
 * Convención de almacenamiento: las columnas `@db.Date` se guardan como un
 * `Date` a medianoche UTC (ej. 2026-07-08T00:00:00.000Z). Así el día calendario
 * queda estable y `isoDesdeFecha` lo recupera sin desfases.
 */

export const ZONA_HORARIA = "America/Santiago";

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;

/** Día calendario chileno de un instante dado, como "YYYY-MM-DD". */
export function fechaISOenSantiago(instante: Date): string {
  // en-CA formatea como "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/** Hoy en Chile, como "YYYY-MM-DD". */
export function hoyEnSantiago(): string {
  return fechaISOenSantiago(new Date());
}

/** Mes actual en Chile, como "YYYY-MM". */
export function mesActualSantiago(): string {
  return hoyEnSantiago().slice(0, 7);
}

/** Hora actual en Chile, como "HH:MM" (24h). */
export function horaActualSantiago(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Día de la semana chileno de hoy: 1=lunes … 7=domingo. */
export function diaSemanaHoySantiago(): number {
  const corto = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    weekday: "short",
  }).format(new Date());
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return dias[corto] ?? 1;
}

/**
 * Semestre escolar chileno según el mes (1=marzo–julio, 2=agosto–diciembre).
 * Enero/febrero son receso: se considera aún cierre del 2º semestre anterior.
 */
export function semestreEscolar(mesISO: string = mesActualSantiago()): 1 | 2 {
  const mes = Number(mesISO.slice(5, 7));
  return mes >= 3 && mes <= 7 ? 1 : 2;
}

/** ¿Es `fecha` (YYYY-MM-DD) posterior a `hoy` (YYYY-MM-DD)? Comparación lexicográfica ISO. */
export function esFechaFutura(fecha: string, hoy: string): boolean {
  return fecha > hoy;
}

/**
 * Valida formato "YYYY-MM-DD" y que el día exista de verdad.
 * OJO: `new Date("2026-02-30T00:00:00Z")` NO falla en V8, hace rollover a
 * 2026-03-02. Por eso verificamos que los componentes sobrevivan al ida y vuelta.
 */
export function esFechaISOValida(fecha: string): boolean {
  if (!RE_ISO.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    d.getUTCFullYear() === anio &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}

/** Convierte "YYYY-MM-DD" a un `Date` a medianoche UTC para columnas `@db.Date`. */
export function fechaDesdeISO(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

/** Recupera "YYYY-MM-DD" desde un `Date` almacenado como `@db.Date` (medianoche UTC). */
export function isoDesdeFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** "martes 8 de julio" — para encabezados de la pantalla de registro. */
export function formatearFechaLarga(fecha: string): string {
  const texto = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC", // la fecha ya es día-solo a medianoche UTC; formatear en UTC evita retroceder un día
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(fechaDesdeISO(fecha));
  // es-CL entrega "martes, 8 de julio"; quitamos la coma para un encabezado más limpio.
  return texto.replace(",", "");
}

/** "julio 2026" — para encabezados de la vista mensual. */
export function formatearMesLargo(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  const texto = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(anio, m - 1, 1)));
  return texto;
}

export type DiaMes = { dia: number; iso: string; finDeSemana: boolean };

/** Rango [inicio, fin] de un mes "YYYY-MM" (Dates a medianoche UTC) y sus días. */
export function rangoMes(mes: string): { inicio: Date; fin: Date; dias: DiaMes[] } {
  if (!RE_MES.test(mes)) throw new Error(`Mes inválido: ${mes}`);
  const [anio, m] = mes.split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, m - 1, 1));
  const fin = new Date(Date.UTC(anio, m, 0)); // día 0 del mes siguiente = último día de este mes
  const totalDias = fin.getUTCDate();
  const dias: DiaMes[] = [];
  for (let d = 1; d <= totalDias; d++) {
    const fecha = new Date(Date.UTC(anio, m - 1, d));
    const dow = fecha.getUTCDay(); // 0 = domingo, 6 = sábado
    dias.push({ dia: d, iso: isoDesdeFecha(fecha), finDeSemana: dow === 0 || dow === 6 });
  }
  return { inicio, fin, dias };
}
