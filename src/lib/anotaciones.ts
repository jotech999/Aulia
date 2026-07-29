/**
 * Dominio de anotaciones del estudiante (hoja de vida — Circular N°30).
 *
 * Lógica pura y testeable: autorización, validación y minimización de datos.
 * La hoja de vida es el registro del debido proceso: el texto debe constatar
 * hechos, sin datos de salud/sensibles (Ley 21.719). Nada se borra físicamente.
 */
import { z } from "zod";
import { esFechaISOValida } from "./fecha";

export const TIPOS_ANOTACION = ["POSITIVA", "NEGATIVA", "NEUTRA"] as const;
export type TipoAnotacion = (typeof TIPOS_ANOTACION)[number];

/** El apoderado nunca crea anotaciones; el resto del staff del colegio sí. */
const ROLES_ANOTAN = new Set([
  "ADMIN",
  "DIRECTOR",
  "UTP",
  "PROFESOR_JEFE",
  "PROFESOR",
  "INSPECTOR",
]);

/**
 * ¿Puede este usuario crear anotaciones? Cualquier rol del staff del colegio.
 * La pertenencia del estudiante al colegio (multi-tenant) se verifica antes.
 */
export function autorizarCrearAnotacion(rol: string): boolean {
  return ROLES_ANOTAN.has(rol);
}

/**
 * ¿Puede eliminar (soft-delete) una anotación? Solo el autor o un rol de
 * dirección/UTP/admin. Siempre con motivo y auditado.
 */
export function autorizarEliminarAnotacion(
  rol: string,
  usuarioId: string,
  anotacion: { autorId: string }
): boolean {
  if (rol === "ADMIN" || rol === "DIRECTOR" || rol === "UTP") return true;
  return anotacion.autorId === usuarioId;
}

/**
 * Heurística de minimización (Ley 21.719): la hoja de vida no debe contener
 * datos de salud/diagnósticos del menor (eso vive cifrado en fichaSalud, no
 * aquí). Advierte ante términos clínicos evidentes. No es exhaustivo ni un
 * bloqueo legal, sino una barrera de captura que evita el error más común.
 */
const TERMINOS_SALUD =
  /\b(diagn[oó]stic\w*|d[ée]ficit atencional|tdah|tea\b|autis\w*|epileps\w*|depresi\w*|ansiedad|medicad\w*|f[aá]rmac\w*|psiquiátr\w*|psicólog\w*|enfermedad|discapacidad)\b/i;

export function pareceDatoSensible(texto: string): boolean {
  return TERMINOS_SALUD.test(texto);
}

export const crearAnotacionSchema = z.object({
  estudianteId: z.string().min(1),
  tipo: z.enum(TIPOS_ANOTACION),
  categoria: z.string().trim().max(40).optional(),
  texto: z
    .string()
    .trim()
    .min(5, "La anotación debe describir el hecho")
    .max(1000, "Anotación demasiado larga"),
  fechaHecho: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(esFechaISOValida, "Fecha inexistente")
    .nullable()
    .default(null),
});
export type CrearAnotacionInput = z.infer<typeof crearAnotacionSchema>;

export const eliminarAnotacionSchema = z.object({
  anotacionId: z.string().min(1),
  motivo: z.string().trim().min(5, "Indica el motivo").max(500),
});
