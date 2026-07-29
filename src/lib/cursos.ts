const ROMANOS_MEDIA: Record<string, string> = {
  "1": "I",
  "2": "II",
  "3": "III",
  "4": "IV",
};

/** Presenta los códigos internos (1B, 2M…) en lenguaje escolar chileno. */
export function nombreCurso(curso: { nivel: string; letra: string }): string {
  const nivel = curso.nivel.trim().toUpperCase();
  const letra = curso.letra.trim().toUpperCase();
  const basica = nivel.match(/^([1-8])B$/);
  if (basica) return `${basica[1]}° básico${letra ? ` ${letra}` : ""}`;

  const media = nivel.match(/^([1-4])M$/);
  if (media) return `${ROMANOS_MEDIA[media[1]]} medio${letra ? ` ${letra}` : ""}`;

  if (nivel === "NT1") return `NT1 · Prekínder${letra ? ` ${letra}` : ""}`;
  if (nivel === "NT2") return `NT2 · Kínder${letra ? ` ${letra}` : ""}`;
  return `${curso.nivel}${letra ? ` ${letra}` : ""}`;
}

/**
 * Orden pedagógico chileno de los niveles: prebásica, básica y media.
 *
 * `Curso.nivel` es un String, así que `orderBy: { nivel: "asc" }` en Prisma
 * ordena alfabéticamente y produce una lista que a un profesor chileno le
 * resulta ajena: 1° básico, I medio, II medio, 3° básico, IV medio, 5° básico…
 * ("1B" < "1M" < "2M" < "3B" < "4M" < "5B"). Este es el orden correcto.
 */
export const ORDEN_NIVELES = [
  "NT1", "NT2",
  "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B",
  "1M", "2M", "3M", "4M",
] as const;

const POSICION_NIVEL = new Map<string, number>(
  ORDEN_NIVELES.map((n, i) => [n, i])
);

/**
 * Posición del nivel en el orden pedagógico. Un nivel desconocido va al final
 * (y no rompe el orden del resto), desempatado alfabéticamente por quien compara.
 */
export function ordenDeNivel(nivel: string): number {
  return POSICION_NIVEL.get(nivel.trim().toUpperCase()) ?? ORDEN_NIVELES.length;
}

/**
 * Comparador de cursos para `Array.prototype.sort`: primero por nivel en orden
 * pedagógico, luego por letra. Usar SIEMPRE al presentar listas de cursos, en
 * lugar de confiar en el `orderBy` de la consulta.
 */
export function compararCursos(
  a: { nivel: string; letra: string },
  b: { nivel: string; letra: string }
): number {
  const porNivel = ordenDeNivel(a.nivel) - ordenDeNivel(b.nivel);
  if (porNivel !== 0) return porNivel;
  // Niveles desconocidos: desempate alfabético estable por el código de nivel.
  if (ordenDeNivel(a.nivel) === ORDEN_NIVELES.length) {
    const porCodigo = a.nivel.localeCompare(b.nivel, "es");
    if (porCodigo !== 0) return porCodigo;
  }
  return a.letra.localeCompare(b.letra, "es");
}

/** Devuelve una copia de la lista ordenada pedagógicamente. */
export function ordenarCursos<T extends { nivel: string; letra: string }>(
  cursos: readonly T[]
): T[] {
  return [...cursos].sort(compararCursos);
}
