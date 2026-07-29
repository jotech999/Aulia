/**
 * Dominio de asistencia diaria (libro de clases — Circular N°30).
 *
 * Este módulo es lógica pura y testeable: validación de entrada, autorización
 * por rol y cálculo del porcentaje de asistencia compatible con SIGE. No toca
 * base de datos ni sesión; eso vive en la server action.
 */
import { z } from "zod";
import { esFechaISOValida } from "./fecha";

export const ESTADOS_ASISTENCIA = [
  "PRESENTE",
  "AUSENTE",
  "ATRASADO",
  "RETIRADO",
] as const;

export type EstadoAsistencia = (typeof ESTADOS_ASISTENCIA)[number];

/** Estado por defecto: todos presentes hasta que el profesor marque lo contrario. */
export const ESTADO_POR_DEFECTO: EstadoAsistencia = "PRESENTE";

/**
 * Estados que cuentan como día asistido para el % (compatibilidad SIGE):
 * el atrasado y el retirado durante la jornada estuvieron presentes ese día.
 * La única inasistencia es AUSENTE.
 */
const ESTADOS_PRESENCIA: ReadonlySet<EstadoAsistencia> = new Set([
  "PRESENTE",
  "ATRASADO",
  "RETIRADO",
]);

export function cuentaComoPresente(estado: EstadoAsistencia): boolean {
  return ESTADOS_PRESENCIA.has(estado);
}

/**
 * Resumen de asistencia sobre una lista de estados (los de un estudiante en el
 * mes, o los de un curso completo). El denominador son los días CON registro
 * (días de clase efectivos), no el calendario teórico.
 */
export function calcularResumen(estados: EstadoAsistencia[]): {
  diasConRegistro: number;
  presentes: number;
  ausentes: number;
  porcentaje: number | null;
} {
  const diasConRegistro = estados.length;
  const presentes = estados.filter(cuentaComoPresente).length;
  const ausentes = diasConRegistro - presentes;
  const porcentaje =
    diasConRegistro === 0
      ? null
      : Math.round((presentes / diasConRegistro) * 1000) / 10; // un decimal
  return { diasConRegistro, presentes, ausentes, porcentaje };
}

/** Umbral de asistencia para promoción (Decreto 67). Informativo, no bloquea el registro. */
export const UMBRAL_ASISTENCIA = 85;

/**
 * ¿Puede este usuario registrar/editar la asistencia de este curso?
 * Autorización a nivel de dominio; la pertenencia al colegio (multi-tenant) se
 * verifica antes, en la query. El APODERADO nunca escribe asistencia.
 */
export function autorizarRegistroAsistencia(
  rol: string,
  usuarioId: string,
  curso: { profesorJefeId: string | null; docenteIds: string[] }
): boolean {
  switch (rol) {
    case "ADMIN":
    case "DIRECTOR":
    case "UTP":
    case "INSPECTOR":
      return true; // acceso a nivel colegio (el tenant ya está filtrado)
    case "PROFESOR_JEFE":
    case "PROFESOR":
      return (
        curso.profesorJefeId === usuarioId ||
        curso.docenteIds.includes(usuarioId)
      );
    default:
      return false; // APODERADO y cualquier otro rol: denegado
  }
}

/** Validación de la entrada de la server action de guardado. */
export const guardarAsistenciaSchema = z.object({
  cursoId: z.string().min(1),
  // Valida formato Y que el día exista: el regex por sí solo acepta 2026-02-30,
  // que luego haría rollover silencioso a otro día en el libro de clases.
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato YYYY-MM-DD")
    .refine(esFechaISOValida, "Fecha inexistente"),
  marcas: z
    .array(
      z.object({
        estudianteId: z.string().min(1),
        estado: z.enum(ESTADOS_ASISTENCIA),
      })
    )
    .min(1, "Debe incluir al menos un estudiante")
    .max(100, "Demasiados estudiantes en una sola solicitud"),
  clientMutationId: z.string().uuid().optional(),
  capturadaEn: z.string().datetime().optional(),
  // Obligatoria incluso en el primer registro (la UI usa el epoch como
  // centinela). Así ningún cliente puede omitir el control optimista y
  // sobrescribir silenciosamente una asistencia ya registrada.
  versionBase: z.string().datetime(),
});

/**
 * Registro de asistencia de una hora pedagógica concreta. Mantiene separada la
 * evidencia por bloque de la asistencia diaria usada en el control mensual.
 */
export const guardarAsistenciaBloqueSchema = guardarAsistenciaSchema.extend({
  bloqueHorarioId: z.string().min(1),
  // Si el bloque corresponde a la segunda hora, el cliente envía también la
  // versión diaria que leyó para impedir una conciliación ciega.
  versionDiariaBase: z.string().datetime().nullable().optional(),
});

export type GuardarAsistenciaInput = z.infer<typeof guardarAsistenciaSchema>;
export type GuardarAsistenciaBloqueInput = z.infer<
  typeof guardarAsistenciaBloqueSchema
>;
