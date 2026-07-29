import { prisma } from "@/lib/prisma";
import { asignaturaCanonica } from "@/lib/planificacion";
import { ROLES_GESTION_RUBRICAS } from "@/lib/rubricas";

export type UsuarioRubricas = { id: string; rol: string; colegioId: string };

export async function asignaturasAccesiblesRubricas(user: UsuarioRubricas) {
  const esGestion = ROLES_GESTION_RUBRICAS.has(user.rol);
  if (!esGestion && !["PROFESOR", "PROFESOR_JEFE"].includes(user.rol)) return [];
  return prisma.asignatura.findMany({
    where: {
      colegioId: user.colegioId,
      ...(esGestion
        ? {}
        : {
            OR: [
              { docenteId: user.id },
              { curso: { profesorJefeId: user.id } },
            ],
          }),
    },
    select: {
      id: true,
      nombre: true,
      docenteId: true,
      curso: {
        select: {
          id: true,
          nivel: true,
          letra: true,
          profesorJefeId: true,
          anioEscolar: { select: { anio: true } },
        },
      },
    },
    orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
  });
}

export async function oasParaEditor(
  asignaturas: Awaited<ReturnType<typeof asignaturasAccesiblesRubricas>>,
  incluirCatalogoCompleto: boolean
) {
  const pares = asignaturas
    .map((asignatura) => ({
      id: asignatura.id,
      nivel: asignatura.curso.nivel,
      nombre: asignaturaCanonica(asignatura.nombre),
    }))
    .filter((item): item is { id: string; nivel: string; nombre: string } => Boolean(item.nombre));
  const oas = await prisma.oa.findMany({
    where: incluirCatalogoCompleto
      ? undefined
      : pares.length > 0
        ? { OR: pares.map((par) => ({ nivel: par.nivel, asignatura: par.nombre })) }
        : { codigo: { in: [] } },
    select: { codigo: true, nivel: true, asignatura: true, eje: true, descripcion: true },
    orderBy: [{ nivel: "asc" }, { asignatura: "asc" }, { numero: "asc" }],
  });
  return oas.map((oa) => ({
    codigo: oa.codigo,
    eje: oa.eje,
    descripcion: oa.descripcion,
    asignaturaIds: pares
      .filter((par) => par.nivel === oa.nivel && par.nombre === oa.asignatura)
      .map((par) => par.id),
  }));
}
