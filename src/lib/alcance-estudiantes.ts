import type { Prisma } from "@prisma/client";

export type ActorEscolar = { id: string; rol: string; colegioId: string };

const ROLES_TODOS = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

export function whereCursosVisibles(actor: ActorEscolar): Prisma.CursoWhereInput {
  if (ROLES_TODOS.has(actor.rol)) return { colegioId: actor.colegioId };
  return {
    colegioId: actor.colegioId,
    OR: [
      { profesorJefeId: actor.id },
      { asignaturas: { some: { colegioId: actor.colegioId, docenteId: actor.id } } },
    ],
  };
}

export function whereEstudiantesVisibles(actor: ActorEscolar): Prisma.EstudianteWhereInput {
  if (ROLES_TODOS.has(actor.rol)) return { colegioId: actor.colegioId };
  return {
    colegioId: actor.colegioId,
    matriculas: {
      some: {
        colegioId: actor.colegioId,
        estado: "ACTIVA",
        retiradaEn: null,
        curso: whereCursosVisibles(actor),
      },
    },
  };
}
