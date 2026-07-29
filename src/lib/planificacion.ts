/**
 * Dominio de planificaciones y cobertura curricular.
 *
 * Lógica pura y testeable: normalización de asignatura al nombre canónico del
 * currículum, autorización, validación de entrada y cálculo de cobertura.
 *
 * Cobertura (Decreto 67 / gestión UTP): se distinguen dos métricas —
 *  - PLANIFICADA: OA que aparecen en alguna planificación (intención).
 *  - TRATADA: OA vinculados a clases efectivamente firmadas (evidencia del
 *    libro de clases). La métrica "oficial" es la tratada; la planificada se
 *    muestra como brecha.
 */
import { z } from "zod";

export const TIPOS_PLANIFICACION = ["ANUAL", "UNIDAD", "CLASE"] as const;
export type TipoPlanificacion = (typeof TIPOS_PLANIFICACION)[number];

export const ESTADOS_CLASE_PLAN = [
  "PLANIFICADA",
  "REALIZADA",
  "REPROGRAMADA",
  "SUSPENDIDA",
] as const;
export type EstadoClasePlan = (typeof ESTADOS_CLASE_PLAN)[number];

/** Estados de clase que cuentan en el denominador de cobertura (Circular 30). */
export const ESTADOS_CLASE_COBERTURA = new Set<EstadoClasePlan>([
  "PLANIFICADA",
  "REALIZADA",
  "REPROGRAMADA",
]);

/** Nombres canónicos de asignatura del currículum (deben calzar con Oa.asignatura). */
export const ASIGNATURAS_CURRICULUM = [
  "Matemática",
  "Lenguaje y Comunicación",
] as const;

/**
 * Normaliza el nombre libre de una `Asignatura` al nombre canónico del
 * currículum para cruzar con el catálogo de OA. Devuelve null si no hay OA
 * cargados para esa asignatura (ej. Historia, Ciencias — fuera del seed actual).
 */
export function asignaturaCanonica(nombre: string): string | null {
  const n = nombre.toLowerCase();
  if (n.includes("matem")) return "Matemática";
  if (n.includes("lenguaje") || n.includes("lengua")) {
    return "Lenguaje y Comunicación";
  }
  return null;
}

/** Roles del colegio con visión total de cobertura. */
const ROLES_COLEGIO = new Set(["ADMIN", "DIRECTOR", "UTP"]);

export function esRolColegio(rol: string): boolean {
  return ROLES_COLEGIO.has(rol);
}

/**
 * ¿Puede crear/editar planificaciones de esta asignatura? El docente de la
 * asignatura o UTP/Director/Admin. La pertenencia al colegio se verifica antes.
 */
export function autorizarPlanificacion(
  rol: string,
  usuarioId: string,
  asignatura: { docenteId: string | null }
): boolean {
  if (ROLES_COLEGIO.has(rol)) return true;
  if (rol === "PROFESOR" || rol === "PROFESOR_JEFE") {
    return asignatura.docenteId === usuarioId;
  }
  return false;
}

export type OaRef = { codigo: string; eje: string };

export type CoberturaEje = {
  eje: string;
  total: number;
  planificados: number;
  tratados: number;
};

export type ResumenCobertura = {
  total: number;
  planificados: number;
  tratados: number;
  pctPlanificado: number; // 0..100, un decimal
  pctTratado: number;
  porEje: CoberturaEje[];
};

function pct(parte: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

/**
 * Calcula la cobertura de una asignatura dado el universo de OA de su nivel y
 * los conjuntos de códigos planificados y tratados (en clases firmadas).
 * Los conjuntos se intersectan con el universo para no contar códigos ajenos
 * al nivel (ej. un OA de otro curso pegado por error).
 */
export function calcularCobertura(
  universo: OaRef[],
  planificados: Set<string>,
  tratados: Set<string>
): ResumenCobertura {
  const porEjeMap = new Map<string, CoberturaEje>();
  let planTotal = 0;
  let tratTotal = 0;

  for (const oa of universo) {
    const eje = porEjeMap.get(oa.eje) ?? {
      eje: oa.eje,
      total: 0,
      planificados: 0,
      tratados: 0,
    };
    eje.total++;
    if (planificados.has(oa.codigo)) {
      eje.planificados++;
      planTotal++;
    }
    if (tratados.has(oa.codigo)) {
      eje.tratados++;
      tratTotal++;
    }
    porEjeMap.set(oa.eje, eje);
  }

  const total = universo.length;
  return {
    total,
    planificados: planTotal,
    tratados: tratTotal,
    pctPlanificado: pct(planTotal, total),
    pctTratado: pct(tratTotal, total),
    porEje: [...porEjeMap.values()].sort((a, b) => a.eje.localeCompare(b.eje)),
  };
}

// ── Validación de entrada ───────────────────────────────────────────────

const fechaOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

export const guardarPlanificacionSchema = z.object({
  asignaturaId: z.string().min(1),
  tipo: z.enum(TIPOS_PLANIFICACION),
  titulo: z.string().trim().min(3, "Título requerido").max(160),
  descripcion: z.string().trim().max(4000).optional(),
  fechaInicio: fechaOpcional,
  fechaFin: fechaOpcional,
  // Solo aplica a tipo CLASE: fecha única y estado pedagógico.
  fechaClase: fechaOpcional,
  estadoClase: z.enum(ESTADOS_CLASE_PLAN).nullable().optional(),
  padreId: z.string().min(1).nullable().optional(),
  // Códigos OA "MA05 OA 07"; se validan contra el catálogo y el nivel en el server.
  oaCodigos: z
    .array(z.string().trim().regex(/^[A-Z]{2}\d{2} OA \d{2}$/))
    .max(60)
    .default([]),
});
export type GuardarPlanificacionInput = z.infer<typeof guardarPlanificacionSchema>;
