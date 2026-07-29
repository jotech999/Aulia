import { FERIADOS_CL } from "@/lib/feriados";

export type VersionHorarioPlanificacion = {
  numero: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
  bloques: { dia: number }[];
};

type EntradaCalculo = {
  anio: number;
  versiones: VersionHorarioPlanificacion[];
  suspensiones: string[];
  feriados?: Readonly<Record<string, string>>;
};

/**
 * Calcula cuántos bloques lectivos de una asignatura caben en cada mes del
 * año escolar. Respeta la versión de horario publicada que estaba vigente en
 * cada fecha y excluye feriados legales y suspensiones del calendario escolar.
 *
 * El resultado cuenta bloques, no días: dos módulos de la asignatura el mismo
 * día son dos clases disponibles para planificar.
 */
export function calcularClasesMensuales({
  anio,
  versiones,
  suspensiones,
  feriados = FERIADOS_CL,
}: EntradaCalculo): Record<number, number> {
  const suspendidas = new Set(suspensiones);
  const resultado: Record<number, number> = {};

  for (let mes = 3; mes <= 12; mes += 1) {
    const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    let total = 0;

    for (let diaMes = 1; diaMes <= dias; diaMes += 1) {
      const fecha = new Date(Date.UTC(anio, mes - 1, diaMes));
      const iso = fecha.toISOString().slice(0, 10);
      if (suspendidas.has(iso) || feriados[iso]) continue;

      const vigentes = versiones
        .filter(
          (version) =>
            version.vigenteDesde <= iso &&
            (!version.vigenteHasta || version.vigenteHasta >= iso)
        )
        .sort(
          (a, b) =>
            b.vigenteDesde.localeCompare(a.vigenteDesde) || b.numero - a.numero
        );
      const version = vigentes[0];
      if (!version) continue;

      const diaSemanaUtc = fecha.getUTCDay();
      const diaSemana = diaSemanaUtc === 0 ? 7 : diaSemanaUtc;
      total += version.bloques.filter((bloque) => bloque.dia === diaSemana).length;
    }

    resultado[mes] = total;
  }

  return resultado;
}

export type FechaClaseCronograma = {
  orden: number;
  fecha: string; // ISO "YYYY-MM-DD" (America/Santiago)
  dia: number; // 1=lunes … 5=viernes
};

type EntradaCronograma = {
  anio: number;
  desde: string; // ISO; primera fecha candidata (inclusive)
  cantidad: number;
  versiones: VersionHorarioPlanificacion[];
  suspensiones: string[];
  feriados?: Readonly<Record<string, string>>;
};

/**
 * Auto-genera el cronograma de clases de una unidad: reparte `cantidad` clases
 * en las fechas hábiles reales del curso a partir de `desde`, respetando la
 * versión de horario vigente en cada día y salteando fines de semana, feriados
 * legales y suspensiones del calendario escolar (America/Santiago).
 *
 * Cada bloque de la asignatura en un día cuenta como una clase; si un día tiene
 * dos módulos, se asignan dos clases consecutivas a ese día. Determinista: no
 * depende de IA ni de reloj (todo entra por parámetros), por lo que es testeable
 * y reproducible. Se detiene al llegar al 31 de diciembre del año escolar.
 */
export function generarCronograma({
  anio,
  desde,
  cantidad,
  versiones,
  suspensiones,
  feriados = FERIADOS_CL,
}: EntradaCronograma): FechaClaseCronograma[] {
  const suspendidas = new Set(suspensiones);
  const salida: FechaClaseCronograma[] = [];
  if (cantidad < 1) return salida;

  const fin = `${anio}-12-31`;
  const partes = desde.split("-").map(Number);
  const cursor = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));

  while (salida.length < cantidad) {
    const iso = cursor.toISOString().slice(0, 10);
    if (iso > fin) break;

    if (!suspendidas.has(iso) && !feriados[iso]) {
      const vigentes = versiones
        .filter(
          (version) =>
            version.vigenteDesde <= iso &&
            (!version.vigenteHasta || version.vigenteHasta >= iso)
        )
        .sort(
          (a, b) =>
            b.vigenteDesde.localeCompare(a.vigenteDesde) || b.numero - a.numero
        );
      const version = vigentes[0];
      if (version) {
        const diaSemanaUtc = cursor.getUTCDay();
        const diaSemana = diaSemanaUtc === 0 ? 7 : diaSemanaUtc;
        const bloquesDia = version.bloques.filter(
          (bloque) => bloque.dia === diaSemana
        ).length;
        for (let i = 0; i < bloquesDia && salida.length < cantidad; i += 1) {
          salida.push({ orden: salida.length + 1, fecha: iso, dia: diaSemana });
        }
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return salida;
}

