/**
 * Construcción de la grilla del horario semanal (lunes–viernes), al estilo del
 * horario de Lirmi que la profesora valoró. Lógica pura y testeable: la página
 * solo la pinta. Los bloques se agrupan por hora de inicio en filas; cada fila
 * tiene una celda por día laboral.
 */

export type BloqueVista = {
  dia: number; // 1=lunes … 5=viernes
  horaInicio: string; // "HH:MM"
  horaFin: string; // "HH:MM"
  asignaturaId: string;
  asignatura: string;
  color: string | null; // clave de paleta (ver colores-asignatura.ts)
  curso?: string;
};

export type FilaHorario = {
  horaInicio: string;
  horaFin: string;
  /** Una celda por día laboral (índice 0=lunes … 4=viernes); null si libre. */
  celdas: (BloqueVista | null)[];
};

export const DIAS_LABORALES = [1, 2, 3, 4, 5] as const;

export const NOMBRE_DIA: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
};

/**
 * Ordena los bloques en una grilla de filas (por hora de inicio) × 5 días.
 * Un bloque solo puede ocupar una celda (nadie está en dos salas a la vez); si
 * hubiera colisión, gana el primero encontrado.
 */
export function construirHorario(bloques: BloqueVista[]): FilaHorario[] {
  const inicios = [...new Set(bloques.map((b) => b.horaInicio))].sort((a, b) =>
    a.localeCompare(b)
  );

  return inicios.map((horaInicio) => {
    // La hora de fin representativa de la fila: la del primer bloque con ese inicio.
    const finRep = bloques.find((b) => b.horaInicio === horaInicio)!.horaFin;
    const celdas = DIAS_LABORALES.map(
      (dia) =>
        bloques.find((b) => b.dia === dia && b.horaInicio === horaInicio) ?? null
    );
    return { horaInicio, horaFin: finRep, celdas };
  });
}
