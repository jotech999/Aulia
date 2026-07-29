import { z } from "zod";
import type { Prisma } from "@prisma/client";

/**
 * Entrevistas / reuniones con apoderados. Dato sensible (Ley 21.719): el acceso
 * se restringe a los docentes del estudiante, la dirección y la inspectoría.
 * El apoderado NO accede a este registro pedagógico interno.
 */

/** Dirección e inspectoría ven las entrevistas de todo el colegio. */
export const ROLES_DIRECCION_INSPECCION = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

export function esDireccionOInspector(rol: string): boolean {
  return ROLES_DIRECCION_INSPECCION.has(rol);
}

/** Roles docentes que además pueden gestionar entrevistas de SUS estudiantes. */
export function esDocente(rol: string): boolean {
  return rol === "PROFESOR" || rol === "PROFESOR_JEFE";
}

/** ¿El rol puede, en principio, registrar/ver entrevistas? (nunca el apoderado). */
export function rolElegibleEntrevistas(rol: string): boolean {
  return esDireccionOInspector(rol) || esDocente(rol);
}

export const crearEntrevistaSchema = z.object({
  estudianteId: z.string().min(1).max(40),
  apoderadoId: z.string().trim().max(40).optional().or(z.literal("")),
  apoderado: z.string().trim().min(2, "Indica el apoderado.").max(120),
  calidadSnapshot: z.string().trim().max(120).optional().or(z.literal("")),
  motivo: z.string().trim().min(3, "Indica el motivo.").max(300),
  acuerdos: z.string().trim().max(3000).optional().default(""),
  compromisos: z.string().trim().max(3000).optional().default(""),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  proximaCita: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

export type CrearEntrevistaInput = z.infer<typeof crearEntrevistaSchema>;

/**
 * Filtro Prisma de los estudiantes cuyas entrevistas puede ver/crear el usuario,
 * siempre acotado a su colegio. Dirección/inspectoría: todo el colegio. Docente:
 * solo estudiantes matriculados en sus cursos (jefatura o asignatura).
 */
export function whereEstudiantesEntrevista(user: {
  id: string;
  rol: string;
  colegioId: string;
}): Prisma.EstudianteWhereInput {
  const base: Prisma.EstudianteWhereInput = { colegioId: user.colegioId };
  if (esDireccionOInspector(user.rol)) return base;
  return {
    ...base,
    matriculas: {
      some: {
        estado: "ACTIVA",
        curso: {
          OR: [
            { profesorJefeId: user.id },
            { asignaturas: { some: { docenteId: user.id } } },
          ],
        },
      },
    },
  };
}
