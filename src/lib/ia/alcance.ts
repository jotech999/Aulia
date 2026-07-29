import type { Prisma } from "@prisma/client";

/** Usuario en sesión, tal como lo provee Auth.js. */
export type UsuarioIA = { id: string; rol: string; colegioId: string };

const ROLES_COLEGIO = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);
const ROLES_GESTION = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

/**
 * Estudiantes que el usuario puede consultar vía IA. El alcance es EXACTAMENTE
 * el de la interfaz para ese rol — la IA no puede ser un canal para eludir
 * permisos (validado con `experto-normativa`). Siempre acotado a `colegioId`.
 *
 *  - Gestión (ADMIN/DIRECTOR/UTP/INSPECTOR): todo el colegio.
 *  - Profesor / Profesor jefe: estudiantes matriculados en sus cursos.
 *  - Apoderado: únicamente sus pupilos.
 */
export function alcanceEstudiantes(user: UsuarioIA): Prisma.EstudianteWhereInput {
  const base: Prisma.EstudianteWhereInput = { colegioId: user.colegioId };

  if (ROLES_COLEGIO.has(user.rol)) return base;

  if (user.rol === "APODERADO") {
    return { ...base, apoderados: { some: { usuarioId: user.id } } };
  }

  // Profesor / Profesor jefe: matrícula activa en un curso accesible.
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

/** Cursos que el usuario puede consultar vía IA (mismo criterio que la UI). */
export function alcanceCursos(user: UsuarioIA): Prisma.CursoWhereInput {
  const base: Prisma.CursoWhereInput = { colegioId: user.colegioId };
  if (ROLES_COLEGIO.has(user.rol)) return base;
  if (user.rol === "APODERADO") {
    // Solo cursos donde tiene un pupilo con matrícula activa.
    return {
      ...base,
      matriculas: {
        some: {
          estado: "ACTIVA",
          estudiante: { apoderados: { some: { usuarioId: user.id } } },
        },
      },
    };
  }
  return {
    ...base,
    OR: [
      { profesorJefeId: user.id },
      { asignaturas: { some: { docenteId: user.id } } },
    ],
  };
}

/**
 * Cursos cuyo perfil de riesgo integral puede ver el usuario. Más restrictivo:
 * gestión (todo el colegio) o profesor JEFE (solo su jefatura). Un profesor de
 * asignatura no accede al perfil de riesgo completo (minimización).
 */
export function alcanceCursosRiesgo(user: UsuarioIA): Prisma.CursoWhereInput | null {
  const base: Prisma.CursoWhereInput = { colegioId: user.colegioId };
  if (ROLES_GESTION.has(user.rol)) return base;
  if (user.rol === "PROFESOR" || user.rol === "PROFESOR_JEFE") {
    return { ...base, profesorJefeId: user.id };
  }
  // Apoderado y otros roles no acceden al panel de riesgo por IA.
  return null;
}
