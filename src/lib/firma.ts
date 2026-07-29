/**
 * Dominio de firma de clases / registro de control de asignatura (Circular N°30).
 *
 * Lógica pura y testeable: autorización y validación de entrada. La firma
 * digital es usuario + timestamp inmutables en la fila, certificados además con
 * una entrada FIRMAR en audit_log (append-only). Una clase firmada queda
 * bloqueada: solo se rectifica por rol elevado o por quien firmó, con motivo y
 * registro MODIFICAR en audit_log. Nada se borra físicamente.
 */
import { z } from "zod";
import { esFechaISOValida } from "./fecha";

/** Roles del colegio que pueden registrar/firmar/rectificar en subrogancia. */
const ROLES_ELEVADOS = new Set(["UTP", "DIRECTOR", "ADMIN"]);

/**
 * ¿Puede este usuario registrar o firmar una clase de esta asignatura?
 * El docente de la asignatura o el profesor jefe del curso; UTP/Director/Admin
 * en subrogancia. La pertenencia al colegio (multi-tenant) se verifica antes.
 */
export function autorizarRegistroClase(
  rol: string,
  usuarioId: string,
  asignatura: { docenteId: string | null; profesorJefeId: string | null }
): boolean {
  if (ROLES_ELEVADOS.has(rol)) return true;
  if (rol === "PROFESOR" || rol === "PROFESOR_JEFE") {
    return (
      asignatura.docenteId === usuarioId ||
      asignatura.profesorJefeId === usuarioId
    );
  }
  return false;
}

/**
 * ¿Puede rectificar una clase YA FIRMADA? Solo rol elevado (UTP/Director/Admin)
 * o quien la firmó. Siempre exige motivo y queda auditado. Editar el contenido
 * de una clase firmada sin este flujo destruiría su valor probatorio.
 */
export function autorizarRectificacion(
  rol: string,
  usuarioId: string,
  clase: { firmadaPorId: string | null }
): boolean {
  if (ROLES_ELEVADOS.has(rol)) return true;
  return clase.firmadaPorId !== null && clase.firmadaPorId === usuarioId;
}

const oaSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20, "Demasiados OA")
  .default([]);

/** Registrar/editar el contenido de una clase (aún no firmada). */
export const guardarClaseSchema = z.object({
  asignaturaId: z.string().min(1),
  bloqueHorarioId: z.string().min(1).nullable().default(null),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD")
    .refine(esFechaISOValida, "Fecha inexistente"),
  contenido: z
    .string()
    .trim()
    .min(3, "Describe los contenidos tratados")
    .max(2000, "Contenido demasiado largo"),
  oaIds: oaSchema,
});
export type GuardarClaseInput = z.infer<typeof guardarClaseSchema>;

/** Rectificar una clase firmada: exige motivo. */
export const rectificarClaseSchema = guardarClaseSchema.extend({
  claseId: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(5, "Indica el motivo de la rectificación")
    .max(500),
});
export type RectificarClaseInput = z.infer<typeof rectificarClaseSchema>;
