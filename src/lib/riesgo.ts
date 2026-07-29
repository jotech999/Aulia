/**
 * Alertas tempranas de riesgo de repitencia/deserción.
 *
 * Lógica pura, transparente y testeable. A diferencia de una "caja negra", el
 * puntaje se calcula con una regla explícita y cada factor explica su aporte:
 * el colegio ve exactamente por qué un estudiante está en riesgo. Se apoya en
 * datos que YA se registran (asistencia, calificaciones, anotaciones), sin
 * capturar información nueva.
 *
 * No decide repitencia (eso lo resuelve el establecimiento, Decreto 67): es una
 * señal de gestión para intervenir a tiempo.
 */
import { NOTA_APROBACION, UMBRAL_ASISTENCIA } from "./calificaciones";

export type NivelRiesgo = "ALTO" | "MEDIO" | "BAJO" | "SIN_DATOS";

/** Mínimo de días con asistencia registrada para que el % sea significativo. */
export const MIN_DIAS_ASISTENCIA = 5;

export type SenalesEstudiante = {
  porcentajeAsistencia: number | null; // null si no hay datos suficientes
  diasConRegistro: number;
  asignaturasReprobadas: number; // promedio de asignatura < 4.0
  asignaturasConNota: number; // asignaturas con al menos una nota
  promedioGeneral: number | null;
  anotacionesNegativas: number;
};

export type Factor = {
  codigo: "ASISTENCIA" | "NOTAS" | "PROMEDIO" | "CONVIVENCIA";
  etiqueta: string;
  detalle: string;
  puntos: number;
};

export type ResultadoRiesgo = {
  nivel: NivelRiesgo;
  puntaje: number;
  factores: Factor[];
};

/**
 * Evalúa el riesgo a partir de las señales agregadas del estudiante.
 * Regla (transparente):
 *  - Asistencia bajo 85% suma según la profundidad (1–3 pts).
 *  - Asignaturas reprobadas: 1→1, 2→2, ≥3→3 pts. Promedio general <4.0 suma 1.
 *  - Anotaciones negativas: ≥3→1, ≥6→2 pts.
 * Nivel: ≥4 ALTO, ≥2 MEDIO, ≥1 BAJO, 0 sin señales; SIN_DATOS si no hay insumos.
 */
export function evaluarRiesgo(s: SenalesEstudiante): ResultadoRiesgo {
  const factores: Factor[] = [];

  const hayAsistencia =
    s.porcentajeAsistencia !== null && s.diasConRegistro >= MIN_DIAS_ASISTENCIA;
  const hayNotas = s.asignaturasConNota > 0;

  // Sin ningún insumo confiable no se puede evaluar.
  if (!hayAsistencia && !hayNotas && s.anotacionesNegativas === 0) {
    return { nivel: "SIN_DATOS", puntaje: 0, factores };
  }

  if (hayAsistencia) {
    const pct = s.porcentajeAsistencia as number;
    if (pct < UMBRAL_ASISTENCIA) {
      const puntos = pct < 70 ? 3 : pct < 80 ? 2 : 1;
      factores.push({
        codigo: "ASISTENCIA",
        etiqueta: "Asistencia bajo el 85%",
        detalle: `${pct}% de asistencia (mínimo de promoción: ${UMBRAL_ASISTENCIA}%).`,
        puntos,
      });
    }
  }

  if (s.asignaturasReprobadas > 0) {
    const puntos = Math.min(s.asignaturasReprobadas, 3);
    factores.push({
      codigo: "NOTAS",
      etiqueta: "Asignaturas reprobadas",
      detalle: `${s.asignaturasReprobadas} asignatura(s) con promedio bajo ${NOTA_APROBACION.toFixed(
        1
      )}.`,
      puntos,
    });
  }

  if (s.promedioGeneral !== null && s.promedioGeneral < NOTA_APROBACION) {
    factores.push({
      codigo: "PROMEDIO",
      etiqueta: "Promedio general reprobatorio",
      detalle: `Promedio general ${s.promedioGeneral.toFixed(1)}.`,
      puntos: 1,
    });
  }

  if (s.anotacionesNegativas >= 3) {
    const puntos = s.anotacionesNegativas >= 6 ? 2 : 1;
    factores.push({
      codigo: "CONVIVENCIA",
      etiqueta: "Anotaciones negativas reiteradas",
      detalle: `${s.anotacionesNegativas} anotaciones negativas registradas.`,
      puntos,
    });
  }

  const puntaje = factores.reduce((a, f) => a + f.puntos, 0);
  const nivel: NivelRiesgo =
    puntaje >= 4 ? "ALTO" : puntaje >= 2 ? "MEDIO" : "BAJO";

  return { nivel, puntaje, factores };
}

/** Orden para listar: mayor riesgo primero. */
export function ordenPorRiesgo(a: ResultadoRiesgo, b: ResultadoRiesgo): number {
  return b.puntaje - a.puntaje;
}

/**
 * Acciones de gestión sugeridas según los factores de riesgo. Regla transparente
 * (no IA): cada factor mapea a una intervención concreta y accionable. Orienta al
 * profesor jefe/dirección sobre el siguiente paso; no reemplaza su criterio.
 */
export function accionesSugeridas(factores: Factor[]): string[] {
  const codigos = new Set(factores.map((f) => f.codigo));
  const acciones: string[] = [];
  if (codigos.has("ASISTENCIA")) {
    acciones.push("Citar al apoderado por las inasistencias y activar seguimiento de asistencia.");
  }
  if (codigos.has("NOTAS") || codigos.has("PROMEDIO")) {
    acciones.push("Plan de reforzamiento/nivelación en las asignaturas descendidas.");
  }
  if (codigos.has("CONVIVENCIA")) {
    acciones.push("Entrevista de convivencia con el apoderado; evaluar derivación a orientación o PIE.");
  }
  return acciones;
}
