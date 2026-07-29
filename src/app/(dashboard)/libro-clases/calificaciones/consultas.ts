import type { Prisma } from "@prisma/client";

/** Roles con acceso a todas las asignaturas del colegio. */
const ROLES_COLEGIO = new Set(["ADMIN", "DIRECTOR", "UTP"]);

/**
 * Filtro Prisma de las asignaturas que el usuario puede calificar, siempre
 * acotado a su colegio (multi-tenant). El profesor solo ve las asignaturas que
 * dicta; UTP/Director/Admin ven todas. Inspector y apoderado: ninguna (se
 * resuelve fuera, negándoles el acceso a la libreta).
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

/** Periodos del año según el régimen del colegio. */
export function periodosDeRegimen(regimen: string): number[] {
  return regimen === "TRIMESTRAL" ? [1, 2, 3] : [1, 2];
}

export function etiquetaPeriodo(regimen: string, periodo: number): string {
  const base = regimen === "TRIMESTRAL" ? "Trimestre" : "Semestre";
  return `${base} ${periodo}`;
}
