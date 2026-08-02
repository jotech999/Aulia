import { prisma } from "@/lib/prisma";
import { normalizarRut } from "@/lib/rut";

/**
 * Consultas del directorio de personas. Todo va acotado al colegio de la sesión
 * (multi-tenant) y con lista blanca de campos: nunca se exponen hashes de clave
 * ni datos que no correspondan a una guía de contactos del colegio.
 */

export type PersonaFila = {
  usuarioId: string;
  membresiaId: string;
  nombre: string;
  email: string;
  rut: string;
  telefono: string | null;
  rol: string;
  activa: boolean;
  /** Cursos donde tiene jefatura (para el equipo docente). */
  jefaturas: string[];
  /** Asignaturas que dicta, con su curso. */
  asignaturas: string[];
  /** Pupilos, si es apoderado. */
  pupilos: { id: string; nombre: string; curso: string | null }[];
};

export type ResultadoDirectorio = {
  personas: PersonaFila[];
  total: number;
  /** Recuento por rol de TODO el colegio (no del filtro), para las pestañas. */
  conteoPorRol: Record<string, number>;
};

const nombreCursoCorto = (c: { nivel: string; letra: string } | null | undefined) =>
  c ? `${c.nivel} ${c.letra}` : null;

export async function listarPersonas(
  colegioId: string,
  filtros: { q?: string; rol?: string; inactivos?: boolean }
): Promise<ResultadoDirectorio> {
  const q = filtros.q?.trim() ?? "";
  const rutBuscado = q ? normalizarRut(q) : null;

  // Búsqueda: nombre, correo o RUT. `mode: insensitive` cubre mayúsculas; los
  // acentos los resuelve el propio Postgres según su colación.
  const dondeUsuario = q
    ? {
        OR: [
          { nombre: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          ...(rutBuscado ? [{ rut: { contains: rutBuscado } }] : []),
        ],
      }
    : {};

  const [membresias, conteos] = await Promise.all([
    prisma.membresia.findMany({
      where: {
        colegioId,
        ...(filtros.inactivos ? {} : { activa: true }),
        ...(filtros.rol ? { rol: filtros.rol as never } : {}),
        usuario: dondeUsuario,
      },
      select: {
        id: true,
        rol: true,
        activa: true,
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
            rut: true,
            telefono: true,
            // Jefaturas y asignaturas del colegio en curso.
            cursosJefatura: {
              where: { colegioId },
              select: { nivel: true, letra: true },
              orderBy: [{ nivel: "asc" }, { letra: "asc" }],
            },
            asignaturas: {
              where: { colegioId },
              select: {
                nombre: true,
                curso: { select: { nivel: true, letra: true } },
              },
              orderBy: { nombre: "asc" },
              take: 12,
            },
            // Pupilos (si es apoderado).
            apoderadoDe: {
              where: { estudiante: { colegioId } },
              select: {
                estudiante: {
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
                },
              },
              take: 12,
            },
          },
        },
      },
      orderBy: [{ rol: "asc" }, { usuario: { nombre: "asc" } }],
      take: 300,
    }),
    prisma.membresia.groupBy({
      by: ["rol"],
      where: { colegioId, activa: true },
      _count: { _all: true },
    }),
  ]);

  const personas: PersonaFila[] = membresias.map((m) => ({
    usuarioId: m.usuario.id,
    membresiaId: m.id,
    nombre: m.usuario.nombre,
    email: m.usuario.email,
    rut: m.usuario.rut,
    telefono: m.usuario.telefono,
    rol: m.rol,
    activa: m.activa,
    jefaturas: m.usuario.cursosJefatura.map((c) => `${c.nivel} ${c.letra}`),
    asignaturas: m.usuario.asignaturas.map(
      (a) => `${a.nombre}${a.curso ? ` · ${a.curso.nivel} ${a.curso.letra}` : ""}`
    ),
    pupilos: m.usuario.apoderadoDe.map((p) => ({
      id: p.estudiante.id,
      nombre: `${p.estudiante.apellidos}, ${p.estudiante.nombres}`,
      curso: nombreCursoCorto(p.estudiante.matriculas[0]?.curso),
    })),
  }));

  return {
    personas,
    total: personas.length,
    conteoPorRol: Object.fromEntries(conteos.map((c) => [c.rol, c._count._all])),
  };
}

/**
 * Apoderados del colegio para el buscador de vinculación. Devuelve lo mínimo
 * para identificar a la persona correcta (nombre, correo, RUT enmascarado y a
 * qué pupilos ya está vinculada), excluyendo a quienes ya lo están con ESTE
 * estudiante.
 */
export async function buscarApoderadosVinculables(
  colegioId: string,
  consulta: string,
  estudianteId: string
) {
  const q = consulta.trim();
  if (q.length < 2) return [];
  const rutBuscado = normalizarRut(q);

  const membresias = await prisma.membresia.findMany({
    where: {
      colegioId,
      activa: true,
      rol: "APODERADO",
      usuario: {
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          ...(rutBuscado ? [{ rut: { contains: rutBuscado } }] : []),
        ],
        // Excluye a quienes ya son apoderados de este estudiante.
        apoderadoDe: { none: { estudianteId } },
      },
    },
    select: {
      usuario: {
        select: {
          id: true,
          nombre: true,
          email: true,
          rut: true,
          apoderadoDe: {
            where: { estudiante: { colegioId } },
            select: { estudiante: { select: { nombres: true, apellidos: true } } },
            take: 4,
          },
        },
      },
    },
    orderBy: { usuario: { nombre: "asc" } },
    take: 12,
  });

  return membresias.map((m) => ({
    usuarioId: m.usuario.id,
    nombre: m.usuario.nombre,
    email: m.usuario.email,
    // RUT enmascarado: alcanza para distinguir homónimos sin exponerlo entero.
    rutParcial: m.usuario.rut.replace(/^(\d{2})\d+(-[\dkK])$/, "$1.···.···$2"),
    pupilos: m.usuario.apoderadoDe.map(
      (p) => `${p.estudiante.nombres.split(" ")[0]} ${p.estudiante.apellidos.split(" ")[0]}`
    ),
  }));
}
