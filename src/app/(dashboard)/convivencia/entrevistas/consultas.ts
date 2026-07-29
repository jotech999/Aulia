import { prisma } from "@/lib/prisma";
import {
  rolElegibleEntrevistas,
  whereEstudiantesEntrevista,
} from "@/lib/entrevistas";

type Usuario = { id: string; rol: string; colegioId: string };

/**
 * ¿El usuario puede ver/registrar entrevistas de ESTE estudiante?
 * Combina el rol (nunca apoderado) con la pertenencia: dirección/inspectoría ven
 * todo el colegio; el docente solo a estudiantes de sus cursos. Multi-tenant.
 */
export async function puedeVerEntrevistasDe(
  user: Usuario,
  estudianteId: string
): Promise<boolean> {
  if (!rolElegibleEntrevistas(user.rol)) return false;
  const e = await prisma.estudiante.findFirst({
    where: { AND: [{ id: estudianteId }, whereEstudiantesEntrevista(user)] },
    select: { id: true },
  });
  return Boolean(e);
}
