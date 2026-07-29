/**
 * Dominio de calificaciones (libro de clases — Decreto 67/2018).
 *
 * Lógica pura y testeable: validación de escala, promedio ponderado y regla de
 * aproximación. No toca base de datos ni sesión; eso vive en la server action.
 *
 * OJO normativo: el Decreto 67 DESREGULÓ el método (número de notas,
 * ponderaciones, redondeo) y lo delegó al reglamento de cada colegio. Aquí se
 * implementa un DEFAULT sensato y documentado, aislado para poder cambiarlo por
 * colegio sin tocar la UI. Lo que el decreto sí obliga es el resultado final:
 * escala 1.0–7.0, aprobación 4.0, calificación final con un decimal y aproximación.
 */
import { z } from "zod";

export const NOTA_MIN = 1.0;
export const NOTA_MAX = 7.0;
/** Nota mínima de aprobación (Decreto 67). */
export const NOTA_APROBACION = 4.0;
/** Umbral de asistencia para promoción (Decreto 67). Informativo, no bloquea. */
export const UMBRAL_ASISTENCIA = 85;

/**
 * Valida una nota individual: 1.0–7.0 con a lo más un decimal.
 * Trabaja sobre el entero ×10 para no arrastrar errores de punto flotante
 * (0.1 no es representable exacto en binario).
 */
export function esNotaValida(nota: number): boolean {
  if (!Number.isFinite(nota)) return false;
  if (nota < NOTA_MIN || nota > NOTA_MAX) return false;
  const escalado = Math.round(nota * 10);
  return Math.abs(escalado - nota * 10) < 1e-9; // exactamente un decimal
}

/** ¿La nota está bajo la aprobación (4.0)? Para la alerta visual de rojos. */
export function esReprobatoria(nota: number): boolean {
  return nota < NOTA_APROBACION;
}

/**
 * Aproximación de la calificación FINAL a la décima, criterio "0.05 sube"
 * (la centésima ≥ 5 sube la décima). Ejemplos: 6.45→6.5, 6.44→6.4, 5.95→6.0.
 *
 * Se aplica SOLO al promedio final (asignatura/periodo/anual), nunca en cascada
 * nota por nota: las notas parciales se guardan tal cual las puso el docente.
 * Trabaja en centésimas enteras para evitar errores de float.
 */
export function aproximarDecima(promedioReal: number): number {
  const centesimas = Math.round(promedioReal * 100); // 6.449999 -> 645
  const decimas = Math.round(centesimas / 10); // 645 -> 65
  return decimas / 10; // 6.5
}

/**
 * Convierte un puntaje a nota 1.0–7.0 con escala lineal y nivel de exigencia
 * (el % del puntaje que corresponde a la nota mínima de aprobación, 4.0).
 * Estándar chileno: exigencia 60% por defecto. Devuelve la nota aproximada a la
 * décima.
 */
export function puntajeANota(puntaje: number, puntajeMax: number, exigencia = 0.6): number {
  if (puntajeMax <= 0) return NOTA_MIN;
  const p = Math.min(Math.max(puntaje, 0), puntajeMax);
  const corte = exigencia * puntajeMax;
  let nota: number;
  if (p >= corte) {
    // De 4.0 (en el corte) a 7.0 (en el máximo).
    nota = NOTA_APROBACION + (NOTA_MAX - NOTA_APROBACION) * (corte === puntajeMax ? 1 : (p - corte) / (puntajeMax - corte));
  } else {
    // De 1.0 (en 0) a 4.0 (en el corte).
    nota = NOTA_MIN + (NOTA_APROBACION - NOTA_MIN) * (corte === 0 ? 1 : p / corte);
  }
  return aproximarDecima(nota);
}

export type ItemPromedio = {
  /** null = pendiente (sin nota aún). */
  nota: number | null;
  /** Peso relativo de la evaluación. Debe ser > 0. */
  ponderacion: number;
  /** Las formativas y las eximidas no entran al promedio. */
  computa: boolean;
};

export type ResultadoPromedio = {
  /** Promedio final aproximado a la décima, o null si no hay notas que computen. */
  promedio: number | null;
  /** Promedio sin aproximar (2 decimales), útil para depurar/mostrar detalle. */
  promedioReal: number | null;
  /** Cuántas evaluaciones aportaron al cálculo. */
  computadas: number;
  reprobatorio: boolean;
};

/**
 * Promedio ponderado de una asignatura/periodo.
 *
 *   promedio = Σ(nota_i × ponderacion_i) / Σ(ponderacion_i)
 *
 * El denominador es Σ ponderación de las evaluaciones que efectivamente tienen
 * nota y computan (no se asume que las ponderaciones sumen 1 ni 100 — el Decreto
 * 67 no lo exige). Las pendientes, eximidas y formativas se excluyen.
 */
export function calcularPromedio(items: ItemPromedio[]): ResultadoPromedio {
  const relevantes = items.filter(
    (i) => i.computa && i.nota !== null && i.ponderacion > 0
  );
  const pesoTotal = relevantes.reduce((s, i) => s + i.ponderacion, 0);
  if (relevantes.length === 0 || pesoTotal <= 0) {
    return {
      promedio: null,
      promedioReal: null,
      computadas: 0,
      reprobatorio: false,
    };
  }
  const suma = relevantes.reduce((s, i) => s + (i.nota as number) * i.ponderacion, 0);
  const promedioReal = Math.round((suma / pesoTotal) * 100) / 100;
  const promedio = aproximarDecima(suma / pesoTotal);
  return {
    promedio,
    promedioReal,
    computadas: relevantes.length,
    reprobatorio: promedio < NOTA_APROBACION,
  };
}

/**
 * Promedio General: media aritmética simple de las calificaciones finales de
 * cada asignatura, también con un decimal y aproximación (Decreto 67).
 */
export function promedioGeneral(finalesPorAsignatura: number[]): number | null {
  if (finalesPorAsignatura.length === 0) return null;
  const suma = finalesPorAsignatura.reduce((s, n) => s + n, 0);
  return aproximarDecima(suma / finalesPorAsignatura.length);
}

/**
 * Situación de promoción por nota (Art. 10 Decreto 67), informativa.
 * Copulativa con asistencia ≥ 85% (que se evalúa aparte). NO bloquea ni decide:
 * la promoción final la resuelve el establecimiento (Art. 11).
 */
export function situacionPromocionPorNota(
  finalesPorAsignatura: number[]
): { reprobadas: number; promuevePorNota: boolean; general: number | null } {
  const general = promedioGeneral(finalesPorAsignatura);
  const reprobadas = finalesPorAsignatura.filter(
    (n) => n < NOTA_APROBACION
  ).length;
  let promuevePorNota = false;
  if (general !== null) {
    if (reprobadas === 0) promuevePorNota = true;
    else if (reprobadas === 1) promuevePorNota = general >= 4.5;
    else if (reprobadas === 2) promuevePorNota = general >= 5.0;
  }
  return { reprobadas, promuevePorNota, general };
}

/** Niveles de prebásica: usan evaluación conceptual (no esta libreta numérica). */
export const NIVELES_PREBASICA = new Set(["NT1", "NT2"]);

export function esNivelPrebasica(nivel: string): boolean {
  return NIVELES_PREBASICA.has(nivel);
}

/** Roles con acceso a todas las asignaturas del colegio para calificar. */
const ROLES_COLEGIO_NOTAS = new Set(["ADMIN", "DIRECTOR", "UTP"]);

/**
 * ¿Puede este usuario registrar/editar calificaciones de esta asignatura?
 * Solo el docente de la asignatura, o UTP/Director/Admin del colegio. La
 * pertenencia al colegio (multi-tenant) se verifica antes, en la query.
 * INSPECTOR y APODERADO nunca escriben notas.
 */
export function autorizarRegistroNotas(
  rol: string,
  usuarioId: string,
  asignatura: { docenteId: string | null }
): boolean {
  if (ROLES_COLEGIO_NOTAS.has(rol)) return true;
  if (rol === "PROFESOR" || rol === "PROFESOR_JEFE") {
    return asignatura.docenteId === usuarioId;
  }
  return false;
}

// ── Validación de entrada de las server actions ─────────────────────────

/** Nota individual: 1.0–7.0 con un decimal, validada sobre entero ×10. */
const notaSchema = z
  .number()
  .refine(esNotaValida, "Nota fuera de escala (1.0–7.0, un decimal)");

/** Crear/editar una evaluación (columna de la grilla). */
export const guardarEvaluacionSchema = z.object({
  asignaturaId: z.string().min(1),
  nombre: z.string().trim().min(1, "Nombre requerido").max(80),
  tipo: z.enum(["SUMATIVA", "FORMATIVA"]).default("SUMATIVA"),
  ponderacion: z
    .number()
    .positive("La ponderación debe ser mayor que 0")
    .max(1000),
  periodo: z.number().int().min(1).max(3).default(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
});
export type GuardarEvaluacionInput = z.infer<typeof guardarEvaluacionSchema>;

/**
 * Guardar una calificación (celda de la grilla). `nota` puede ser:
 * - número válido → nota registrada,
 * - null → pendiente (limpia la nota),
 * - `eximida: true` → eximido (no entra al promedio).
 */
export const guardarCalificacionSchema = z.object({
  evaluacionId: z.string().min(1),
  estudianteId: z.string().min(1),
  nota: notaSchema.nullable().default(null),
  eximida: z.boolean().default(false),
});
export type GuardarCalificacionInput = z.infer<typeof guardarCalificacionSchema>;
