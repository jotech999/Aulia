import type { Prisma } from "@prisma/client";
import { esEquipoConvivencia } from "@/lib/convivencia";

/**
 * Casos que el usuario puede ver, acotado a su colegio. El equipo de convivencia
 * ve todos; el profesor jefe solo los de estudiantes con matrícula activa en su
 * jefatura. (El resto de roles no llega aquí: la página los bloquea.)
 */
export function whereCasosAccesibles(user: {
  id: string;
  rol: string;
  colegioId: string;
}): Prisma.CasoConvivenciaWhereInput {
  const base: Prisma.CasoConvivenciaWhereInput = {
    colegioId: user.colegioId,
    eliminadoEn: null,
  };
  if (esEquipoConvivencia(user.rol)) return base;
  return {
    ...base,
    estudiante: {
      matriculas: {
        some: { estado: "ACTIVA", curso: { profesorJefeId: user.id } },
      },
    },
  };
}

/** Estudiantes para los que el usuario puede abrir un caso. */
export function whereEstudiantesAccesibles(user: {
  id: string;
  rol: string;
  colegioId: string;
}): Prisma.EstudianteWhereInput {
  const base: Prisma.EstudianteWhereInput = { colegioId: user.colegioId };
  if (esEquipoConvivencia(user.rol)) {
    return { ...base, matriculas: { some: { estado: "ACTIVA" } } };
  }
  return {
    ...base,
    matriculas: {
      some: { estado: "ACTIVA", curso: { profesorJefeId: user.id } },
    },
  };
}
