export type BloqueLeccionario = {
  id: string;
  dia: number;
  horaInicio: string;
  horaFin: string;
  versionNumero: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
};

/**
 * Resuelve los bloques que pertenecían a la versión publicada vigente en una
 * fecha. Si por datos históricos hay vigencias solapadas, gana la versión más
 * reciente y, a igual inicio, la de mayor número.
 */
export function bloquesParaFecha(
  bloques: BloqueLeccionario[],
  fecha: string
): BloqueLeccionario[] {
  const diaUtc = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const dia = diaUtc === 0 ? 7 : diaUtc;
  const candidatos = bloques.filter(
    (bloque) =>
      bloque.dia === dia &&
      (!bloque.vigenteDesde || bloque.vigenteDesde <= fecha) &&
      (!bloque.vigenteHasta || bloque.vigenteHasta >= fecha)
  );
  const versionActiva = candidatos
    .map((bloque) => ({
      numero: bloque.versionNumero ?? 0,
      desde: bloque.vigenteDesde ?? "0000-00-00",
    }))
    .sort(
      (a, b) => b.desde.localeCompare(a.desde) || b.numero - a.numero
    )[0];
  if (!versionActiva) return [];
  return candidatos.filter(
    (bloque) =>
      (bloque.vigenteDesde ?? "0000-00-00") === versionActiva.desde &&
      (bloque.versionNumero ?? 0) === versionActiva.numero
  );
}

