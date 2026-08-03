"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { ROLES_VER_PERSONAS, ROLES_VER_TODAS_LAS_FAMILIAS } from "@/lib/personas";
import { whereCursosAccesibles } from "@/app/(dashboard)/libro-clases/asistencia/consultas";
import { whereEstudiantesVisibles } from "@/lib/alcance-estudiantes";

// Roles que pueden buscar y abrir la ficha de un estudiante (staff docente/admin).
// Excluye apoderado (solo ve a sus pupilos) y PIE (navegación acotada).
const STAFF_FICHA = new Set([
  "ADMIN",
  "DIRECTOR",
  "UTP",
  "PROFESOR_JEFE",
  "PROFESOR",
  "INSPECTOR",
]);

export type EstudianteBusqueda = { id: string; nombre: string; curso: string | null };
export type CursoBusqueda = { id: string; nombre: string; detalle: string | null };
export type ApoderadoBusqueda = { id: string; nombre: string; detalle: string | null };

export type ResultadosBusqueda = {
  estudiantes: EstudianteBusqueda[];
  cursos: CursoBusqueda[];
  apoderados: ApoderadoBusqueda[];
};

const VACIO: ResultadosBusqueda = { estudiantes: [], cursos: [], apoderados: [] };

/** Fragmento SQL que compara sin tildes ni mayúsculas (López = lopez). */
function comoSinTildes(columna: Prisma.Sql, termino: string) {
  return Prisma.sql`unaccent(lower(${columna})) LIKE unaccent(lower(${"%" + termino + "%"}))`;
}

/**
 * Busca estudiantes por nombre, apellido o RUT para el buscador global (⌘K).
 * Acotado al colegio de la sesión (multi-tenant) y solo para staff. Devuelve
 * pocos resultados; no expone datos sensibles (solo nombre y curso).
 */
export async function buscarEstudiantes(consulta: string): Promise<EstudianteBusqueda[]> {
  const { estudiantes } = await buscarEnColegio(consulta);
  return estudiantes;
}

/**
 * BUSCADOR GLOBAL — estudiantes, cursos y apoderados en una sola consulta.
 *
 * Antes la paleta solo encontraba estudiantes y secciones fijas, así que para
 * llegar a un curso o a una familia había que acordarse del menú. Ahora se
 * escribe "5B" o el apellido del apoderado y se salta directo.
 *
 * Autorización — el mismo alcance que ya tiene cada rol en la interfaz, porque
 * un buscador no puede ser la puerta de atrás a datos que la pantalla esconde:
 *  - Estudiantes: solo staff docente/administrativo.
 *  - Cursos: los que la persona puede abrir (`whereCursosAccesibles`).
 *  - Apoderados: solo quien entra al directorio; y quien no ve a todas las
 *    familias (docentes) ve únicamente a las de SUS cursos.
 */
export async function buscarEnColegio(consulta: string): Promise<ResultadosBusqueda> {
  const q = consulta.trim();
  if (q.length < 2) return VACIO;

  const { user } = await requerirSesion();
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 4);
  const verTodasLasFamilias = ROLES_VER_TODAS_LAS_FAMILIAS.has(user.rol);

  const [estudiantes, cursos, apoderados] = await Promise.all([
    buscarEstudiantesInterno(user, tokens),
    buscarCursosInterno(user, q),
    buscarApoderadosInterno(user, tokens, verTodasLasFamilias),
  ]);

  return { estudiantes, cursos, apoderados };
}

type Usuario = { id: string; rol: string; colegioId: string };

async function buscarEstudiantesInterno(
  user: Usuario,
  tokens: string[]
): Promise<EstudianteBusqueda[]> {
  if (!STAFF_FICHA.has(user.rol)) return [];

  // Búsqueda insensible a tildes (nombres chilenos: López, Muñoz, Peña…) con la
  // extensión `unaccent` de Postgres. Cada token debe aparecer en nombre+apellido+RUT.
  const condiciones = tokens.map((t) =>
    comoSinTildes(
      Prisma.sql`e."nombres" || ' ' || e."apellidos" || ' ' || e."rut"`,
      t.replace(/\./g, "")
    )
  );
  /*
   * El SQL crudo solo PREFILTRA por texto: no sabe de alcance por curso. Por eso
   * pide más candidatos de los que va a mostrar y el filtro real lo aplica
   * después `whereEstudiantesVisibles`, el mismo helper que usa la ficha del
   * estudiante. Sin ese segundo paso, un profesor de una asignatura podía
   * escribir un apellido y ver el nombre y el curso de estudiantes de todo el
   * colegio: el buscador no puede mostrar lo que la pantalla esconde.
   */
  const filas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT e."id"
    FROM "Estudiante" e
    WHERE e."colegioId" = ${user.colegioId} AND ${Prisma.join(condiciones, " AND ")}
    ORDER BY e."apellidos" ASC, e."nombres" ASC
    LIMIT 40
  `);
  const ids = filas.map((f) => f.id);
  if (ids.length === 0) return [];

  const estudiantes = await prisma.estudiante.findMany({
    where: { id: { in: ids }, ...whereEstudiantesVisibles(user) },
    take: 6,
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { curso: { select: { nivel: true, letra: true } } },
        take: 1,
      },
    },
    orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
  });

  return estudiantes.map((e) => ({
    id: e.id,
    nombre: `${e.nombres} ${e.apellidos}`,
    curso: e.matriculas[0] ? `${e.matriculas[0].curso.nivel} ${e.matriculas[0].curso.letra}` : null,
  }));
}

/**
 * Cursos accesibles que coincidan con lo escrito. Se busca contra "nivel letra"
 * concatenado y sin espacios, porque nadie escribe «5° Básico B»: escribe "5b".
 */
async function buscarCursosInterno(user: Usuario, q: string): Promise<CursoBusqueda[]> {
  if (user.rol === "APODERADO" || user.rol === "ESTUDIANTE" || user.rol === "SOSTENEDOR") {
    return [];
  }

  const cursos = await prisma.curso.findMany({
    where: whereCursosAccesibles(user),
    select: {
      id: true,
      nivel: true,
      letra: true,
      profesorJefe: { select: { nombre: true } },
      _count: { select: { matriculas: { where: { estado: "ACTIVA" } } } },
    },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
    take: 60,
  });

  const normal = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const objetivo = normal(q);
  if (!objetivo) return [];

  return cursos
    .filter((c) => normal(`${c.nivel}${c.letra}`).includes(objetivo))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      nombre: `${c.nivel} ${c.letra}`,
      detalle: [
        c._count.matriculas > 0 ? `${c._count.matriculas} estudiantes` : null,
        c.profesorJefe?.nombre ? `Prof. jefe: ${c.profesorJefe.nombre}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    }));
}

/**
 * Apoderados que la persona tiene derecho a ver. Se devuelve el nombre y a qué
 * pupilos corresponde — lo justo para reconocer a la familia correcta — y NUNCA
 * el RUT ni el teléfono: para eso está el directorio, que además audita.
 */
async function buscarApoderadosInterno(
  user: Usuario,
  tokens: string[],
  verTodasLasFamilias: boolean
): Promise<ApoderadoBusqueda[]> {
  if (!ROLES_VER_PERSONAS.has(user.rol)) return [];

  const alcanceFamilias = verTodasLasFamilias
    ? {}
    : {
        apoderadoDe: {
          some: {
            estudiante: {
              colegioId: user.colegioId,
              matriculas: {
                some: { estado: "ACTIVA" as const, curso: whereCursosAccesibles(user) },
              },
            },
          },
        },
      };

  const membresias = await prisma.membresia.findMany({
    where: {
      colegioId: user.colegioId,
      activa: true,
      rol: "APODERADO",
      usuario: {
        AND: tokens.map((t) => ({
          OR: [
            { nombre: { contains: t, mode: "insensitive" as const } },
            { email: { contains: t, mode: "insensitive" as const } },
          ],
        })),
        ...alcanceFamilias,
      },
    },
    select: {
      usuario: {
        select: {
          id: true,
          nombre: true,
          apoderadoDe: {
            where: { estudiante: { colegioId: user.colegioId } },
            select: { estudiante: { select: { nombres: true, apellidos: true } } },
            take: 3,
          },
        },
      },
    },
    orderBy: { usuario: { nombre: "asc" } },
    take: 5,
  });

  return membresias.map((m) => ({
    id: m.usuario.id,
    nombre: m.usuario.nombre,
    detalle:
      m.usuario.apoderadoDe.length > 0
        ? `Apoderado de ${m.usuario.apoderadoDe
            .map((p) => `${p.estudiante.nombres.split(" ")[0]} ${p.estudiante.apellidos.split(" ")[0]}`)
            .join(", ")}`
        : "Apoderado",
  }));
}
