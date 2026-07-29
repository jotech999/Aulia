import type { Prisma } from "@prisma/client";

const ROLES_COLEGIO = new Set(["ADMIN", "DIRECTOR", "UTP"]);

/**
 * Asignaturas cuyas planificaciones/cobertura el usuario puede ver, acotado a su
 * colegio (multi-tenant). El profesor ve las que dicta; UTP/Director/Admin todas.
 */
export function whereAsignaturasAccesibles(user: {
  id: string;
  rol: string;
  colegioId: string;
}): Prisma.AsignaturaWhereInput {
  const base: Prisma.AsignaturaWhereInput = { colegioId: user.colegioId };
  if (ROLES_COLEGIO.has(user.rol)) return base;
  return { ...base, docenteId: user.id };
}
