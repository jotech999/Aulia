import type { Prisma } from "@prisma/client";

/** Roles del colegio con acceso a todas las asignaturas. */
const ROLES_COLEGIO = new Set(["ADMIN", "DIRECTOR", "UTP"]);

/**
 * Filtro Prisma de las asignaturas cuyas clases el usuario puede registrar/
 * firmar, acotado a su colegio (multi-tenant). El profesor ve las asignaturas
 * que dicta y las del curso donde es jefe; UTP/Director/Admin ven todas.
 */
export function whereAsignaturasFirma(user: {
  id: string;
  rol: string;
  colegioId: string;
}): Prisma.AsignaturaWhereInput {
  const base: Prisma.AsignaturaWhereInput = { colegioId: user.colegioId };
  if (ROLES_COLEGIO.has(user.rol)) return base;
  return {
    ...base,
    OR: [{ docenteId: user.id }, { curso: { profesorJefeId: user.id } }],
  };
}
