import type { Prisma } from "@prisma/client";

/** Roles con acceso a todos los cursos del colegio. */
const ROLES_COLEGIO = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

/**
 * Filtro Prisma de los cursos que el usuario puede ver/registrar, siempre
 * acotado a su colegio (regla multi-tenant). Profesores solo ven su jefatura y
 * los cursos donde dictan asignatura.
 */
export function whereCursosAccesibles(user: {
  id: string;
  rol: string;
  colegioId: string;
}): Prisma.CursoWhereInput {
  const base: Prisma.CursoWhereInput = { colegioId: user.colegioId };
  if (ROLES_COLEGIO.has(user.rol)) return base;
  return {
    ...base,
    OR: [
      { profesorJefeId: user.id },
      { asignaturas: { some: { docenteId: user.id } } },
    ],
  };
}
