"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";

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

/**
 * Busca estudiantes por nombre, apellido o RUT para el buscador global (⌘K).
 * Acotado al colegio de la sesión (multi-tenant) y solo para staff. Devuelve
 * pocos resultados; no expone datos sensibles (solo nombre y curso).
 */
export async function buscarEstudiantes(consulta: string): Promise<EstudianteBusqueda[]> {
  const q = consulta.trim();
  if (q.length < 2) return [];

  const { user } = await requerirSesion();
  if (!STAFF_FICHA.has(user.rol)) return [];

  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 4);

  // Búsqueda insensible a tildes (nombres chilenos: López, Muñoz, Peña…) con la
  // extensión `unaccent` de Postgres. Cada token debe aparecer en nombre+apellido+RUT.
  const condiciones = tokens.map(
    (t) =>
      Prisma.sql`unaccent(lower(e."nombres" || ' ' || e."apellidos" || ' ' || e."rut")) LIKE unaccent(lower(${"%" + t.replace(/\./g, "") + "%"}))`
  );
  const filas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT e."id"
    FROM "Estudiante" e
    WHERE e."colegioId" = ${user.colegioId} AND ${Prisma.join(condiciones, " AND ")}
    ORDER BY e."apellidos" ASC, e."nombres" ASC
    LIMIT 6
  `);
  const ids = filas.map((f) => f.id);
  if (ids.length === 0) return [];

  const estudiantes = await prisma.estudiante.findMany({
    where: { id: { in: ids }, colegioId: user.colegioId },
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
