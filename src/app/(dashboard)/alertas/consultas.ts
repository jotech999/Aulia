import type { Prisma } from "@prisma/client";

/** Roles de gestión con visión de riesgo de todo el colegio. */
const ROLES_GESTION = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

/**
 * Cursos cuyo panel de riesgo puede ver el usuario, acotado a su colegio.
 *
 * A diferencia de otros módulos, el panel de riesgo cruza TODAS las asignaturas,
 * asistencia y anotaciones de cada estudiante. Por minimización (Ley 21.719)
 * solo lo ven los roles con responsabilidad integral sobre el estudiante: la
 * gestión (todo el colegio) y el profesor JEFE (solo su jefatura). Un profesor
 * de una sola asignatura no accede al perfil de riesgo completo.
 */
export function whereCursosAlertas(user: {
  id: string;
  rol: string;
  colegioId: string;
}): Prisma.CursoWhereInput {
  const base: Prisma.CursoWhereInput = { colegioId: user.colegioId };
  if (ROLES_GESTION.has(user.rol)) return base;
  return { ...base, profesorJefeId: user.id };
}
