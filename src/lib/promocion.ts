/**
 * PROMOCIÓN ESCOLAR — Decreto 67/2018, artículos 10 y 11.
 *
 * Lógica pura y testeable: decide el estado de promoción de un estudiante a
 * partir de sus promedios finales por asignatura y su porcentaje de asistencia.
 * No toca base de datos ni sesión.
 *
 * REGLAS (Art. 10 del Decreto 67):
 *  Logro de objetivos — se promueve quien:
 *   a) aprueba TODAS las asignaturas, o
 *   b) reprueba UNA asignatura y su promedio general es ≥ 4.5 (incluida la
 *      reprobada), o
 *   c) reprueba DOS asignaturas y su promedio general es ≥ 5.0 (incluidas las
 *      reprobadas).
 *  Asistencia — se requiere ≥ 85% de las clases establecidas en el calendario
 *  anual. El director, junto al equipo directivo, PUEDE autorizar la promoción
 *  con menos asistencia por razones justificadas (art. 10, inciso final).
 *
 * ART. 11: el establecimiento debe analizar CASO A CASO la situación de quienes
 * no cumplen los requisitos, con un informe del profesor jefe y UTP, y la
 * decisión debe quedar en una resolución fundada. Por eso el sistema NUNCA
 * decide solo: propone un estado y exige que una persona con rol competente
 * registre la resolución.
 */

/** Estado de promoción propuesto por el sistema o resuelto por el colegio. */
export type EstadoPromocion = "PROMOVIDO" | "REPITE" | "ANALISIS";

export const NOTA_APROBACION_PROMOCION = 4.0;
export const ASISTENCIA_MINIMA_PROMOCION = 85;

export type AsignaturaPromocion = {
  nombre: string;
  /** Promedio final anual, ya aproximado a la décima. null = sin calificaciones. */
  promedio: number | null;
  /** Asignaturas eximidas o que no inciden en la promoción (ej. religión). */
  incidePromocion?: boolean;
};

export type EntradaPromocion = {
  asignaturas: AsignaturaPromocion[];
  /** Porcentaje de asistencia anual (0–100). null = sin registro. */
  asistencia: number | null;
};

export type ResultadoPromocion = {
  estado: EstadoPromocion;
  /** Promedio general anual (media de los promedios que inciden), o null. */
  promedioGeneral: number | null;
  asignaturasReprobadas: string[];
  cumpleLogro: boolean;
  cumpleAsistencia: boolean;
  /** Explicación en lenguaje humano de por qué quedó en ese estado. */
  motivos: string[];
  /** Regla del art. 10 que aplicó (a, b, c) cuando cumple logro. */
  reglaLogro: "a" | "b" | "c" | null;
};

/** Media simple de los promedios que inciden, aproximada a la décima. */
function promedioDeAsignaturas(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const suma = valores.reduce((s, v) => s + v, 0);
  const centesimas = Math.round((suma / valores.length) * 100);
  return Math.round(centesimas / 10) / 10;
}

/**
 * Evalúa la situación final de un estudiante según el Art. 10 del Decreto 67.
 * El resultado es una PROPUESTA: el colegio debe resolver (art. 11) cuando el
 * estado es ANALISIS.
 */
export function evaluarPromocion(entrada: EntradaPromocion): ResultadoPromocion {
  const inciden = entrada.asignaturas.filter((a) => a.incidePromocion !== false);
  const conNota = inciden.filter(
    (a): a is AsignaturaPromocion & { promedio: number } => a.promedio !== null
  );
  const promedioGeneral = promedioDeAsignaturas(conNota.map((a) => a.promedio));
  const reprobadas = conNota.filter((a) => a.promedio < NOTA_APROBACION_PROMOCION);
  const nombresReprobadas = reprobadas.map((a) => a.nombre);

  // ── Requisito de logro (Art. 10 letra a) ────────────────────────────────
  let cumpleLogro = false;
  let reglaLogro: "a" | "b" | "c" | null = null;
  if (conNota.length === 0) {
    cumpleLogro = false; // sin calificaciones no se puede afirmar el logro
  } else if (reprobadas.length === 0) {
    cumpleLogro = true;
    reglaLogro = "a";
  } else if (reprobadas.length === 1 && promedioGeneral !== null && promedioGeneral >= 4.5) {
    cumpleLogro = true;
    reglaLogro = "b";
  } else if (reprobadas.length === 2 && promedioGeneral !== null && promedioGeneral >= 5.0) {
    cumpleLogro = true;
    reglaLogro = "c";
  }

  // ── Requisito de asistencia (Art. 10 letra b) ───────────────────────────
  const cumpleAsistencia =
    entrada.asistencia !== null && entrada.asistencia >= ASISTENCIA_MINIMA_PROMOCION;

  // ── Motivos legibles ────────────────────────────────────────────────────
  const motivos: string[] = [];
  if (conNota.length === 0) {
    motivos.push("Sin calificaciones finales registradas.");
  } else if (reprobadas.length === 0) {
    motivos.push("Aprueba todas las asignaturas.");
  } else {
    motivos.push(
      `${reprobadas.length} ${reprobadas.length === 1 ? "asignatura reprobada" : "asignaturas reprobadas"}: ${nombresReprobadas.join(", ")}.`
    );
    if (cumpleLogro && reglaLogro === "b") {
      motivos.push(`Promedio general ${promedioGeneral?.toFixed(1)} ≥ 4.5 (Art. 10 b).`);
    } else if (cumpleLogro && reglaLogro === "c") {
      motivos.push(`Promedio general ${promedioGeneral?.toFixed(1)} ≥ 5.0 (Art. 10 c).`);
    } else if (reprobadas.length === 1) {
      motivos.push(`Promedio general ${promedioGeneral?.toFixed(1)} bajo 4.5 exigido con 1 reprobada.`);
    } else if (reprobadas.length === 2) {
      motivos.push(`Promedio general ${promedioGeneral?.toFixed(1)} bajo 5.0 exigido con 2 reprobadas.`);
    } else {
      motivos.push("Más de 2 asignaturas reprobadas.");
    }
  }
  if (entrada.asistencia === null) {
    motivos.push("Sin registro de asistencia.");
  } else if (!cumpleAsistencia) {
    motivos.push(
      `Asistencia ${entrada.asistencia}% bajo el 85% exigido — el director puede autorizarla con resolución fundada.`
    );
  } else {
    motivos.push(`Asistencia ${entrada.asistencia}%.`);
  }

  // ── Estado propuesto ────────────────────────────────────────────────────
  // Solo se propone PROMOVIDO cuando ambos requisitos se cumplen limpiamente.
  // Todo lo demás va a ANÁLISIS (Art. 11), salvo el caso claramente reprobatorio
  // por logro (3 o más asignaturas reprobadas), que se propone REPITE.
  let estado: EstadoPromocion;
  if (cumpleLogro && cumpleAsistencia) {
    estado = "PROMOVIDO";
  } else if (reprobadas.length >= 3) {
    estado = "REPITE";
  } else {
    estado = "ANALISIS";
  }

  return {
    estado,
    promedioGeneral,
    asignaturasReprobadas: nombresReprobadas,
    cumpleLogro,
    cumpleAsistencia,
    motivos,
    reglaLogro,
  };
}

export const ETIQUETA_PROMOCION: Record<EstadoPromocion, string> = {
  PROMOVIDO: "Promovido",
  REPITE: "Repite",
  ANALISIS: "Análisis caso a caso",
};

export const ESTILO_PROMOCION: Record<EstadoPromocion, string> = {
  PROMOVIDO: "bg-exito-suave text-exito",
  REPITE: "bg-peligro-suave text-peligro",
  ANALISIS: "bg-alerta-suave text-alerta",
};

/** Roles que pueden ver y resolver el cierre anual. */
export const ROLES_CIERRE_ANUAL = new Set(["ADMIN", "DIRECTOR", "UTP"]);
/** Solo dirección firma la resolución final (Art. 11). */
export const ROLES_RESOLVER_PROMOCION = new Set(["ADMIN", "DIRECTOR"]);
