import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { whereEstudiantesVisibles, type ActorEscolar } from "@/lib/alcance-estudiantes";
import { puedePie, ROLES_APOYOS_AULA } from "@/lib/pie";

/**
 * ADECUACIONES DE AULA — la mitad del PIE que sí le corresponde al docente.
 *
 * Estas consultas son la frontera técnica de esa decisión: el `select` NO
 * incluye `diagnosticoCifrado` ni `sesiones` ni `profesionalACargo`. No es que
 * se filtren después: nunca salen de la base. Así, aunque alguien más adelante
 * pase estos datos a un componente cliente por error, no hay nada clínico que
 * filtrar.
 *
 * El alcance de estudiantes es el mismo del resto de la plataforma
 * (`whereEstudiantesVisibles`): dirección y UTP ven el colegio; un profesor ve
 * a los estudiantes de los cursos donde hace clases o tiene jefatura.
 *
 * Además se respeta el interruptor `indicadorPieDocentes` del colegio, que ya
 * existía para decidir si el equipo docente puede siquiera saber QUIÉN participa
 * del programa. Saltárselo aquí habría vaciado de sentido una decisión que el
 * colegio ya tomó a conciencia; para el equipo PIE y la dirección no aplica,
 * porque el dato es suyo.
 */

/**
 * Alcance de estudiantes para las adecuaciones.
 *
 * Para el equipo PIE es el colegio completo: son ellos quienes escriben estas
 * fichas. No se usa `whereEstudiantesVisibles` en su caso porque ese helper
 * acota por curso —jefatura o asignaturas a cargo— y un profesional PIE no
 * tiene cursos asignados: le habría devuelto una lista vacía justamente a quien
 * es dueño del dato.
 */
function alcance(user: ActorEscolar): Prisma.EstudianteWhereInput {
  return puedePie(user.rol) ? { colegioId: user.colegioId } : whereEstudiantesVisibles(user);
}

export type ApoyoAula = {
  estudianteId: string;
  nombre: string;
  curso: string | null;
  apoyos: string;
  actualizadaEn: Date;
};

/** ¿Puede esta persona ver adecuaciones, considerando el ajuste del colegio? */
export async function apoyosHabilitadosPara(user: ActorEscolar): Promise<boolean> {
  if (!ROLES_APOYOS_AULA.has(user.rol)) return false;
  if (puedePie(user.rol)) return true; // el dato es del equipo PIE y la dirección
  const cfg = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: { indicadorPieDocentes: true },
  });
  return Boolean(cfg?.indicadorPieDocentes);
}

/** Estudiantes con adecuaciones registradas, dentro del alcance de la persona. */
export async function listarApoyosDeAula(user: ActorEscolar): Promise<ApoyoAula[]> {
  if (!(await apoyosHabilitadosPara(user))) return [];

  const fichas = await prisma.fichaPie.findMany({
    where: {
      colegioId: user.colegioId,
      eliminadaEn: null,
      estudiante: alcance(user),
    },
    select: {
      estudianteId: true,
      apoyos: true,
      actualizadaEn: true,
      estudiante: {
        select: {
          nombres: true,
          apellidos: true,
          matriculas: {
            where: { estado: "ACTIVA" },
            select: { curso: { select: { nivel: true, letra: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ estudiante: { apellidos: "asc" } }, { estudiante: { nombres: "asc" } }],
    take: 300,
  });

  return fichas.map((f) => {
    const c = f.estudiante.matriculas[0]?.curso;
    return {
      estudianteId: f.estudianteId,
      nombre: `${f.estudiante.apellidos}, ${f.estudiante.nombres}`,
      curso: c ? `${c.nivel} ${c.letra}` : null,
      apoyos: (f.apoyos ?? "").trim(),
      actualizadaEn: f.actualizadaEn,
    };
  });
}

/**
 * Adecuaciones de UN estudiante, para mostrarlas en su ficha. Devuelve null si
 * no hay ficha PIE o si la persona no tiene por qué verla — la comprobación de
 * alcance va en la propia consulta, no en quien la llama.
 */
export async function apoyosDeEstudiante(
  user: ActorEscolar,
  estudianteId: string
): Promise<{ apoyos: string; actualizadaEn: Date } | null> {
  if (!(await apoyosHabilitadosPara(user))) return null;

  const ficha = await prisma.fichaPie.findFirst({
    where: {
      estudianteId,
      colegioId: user.colegioId,
      eliminadaEn: null,
      estudiante: alcance(user),
    },
    select: { apoyos: true, actualizadaEn: true },
  });
  if (!ficha) return null;

  return { apoyos: (ficha.apoyos ?? "").trim(), actualizadaEn: ficha.actualizadaEn };
}
