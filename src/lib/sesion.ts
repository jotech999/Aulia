import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./prisma";

export const COOKIE_CONTEXTO = "aulia-contexto";

/**
 * Obtiene la sesión o redirige a /login.
 * TODA página del dashboard y TODO server action deben partir por aquí,
 * y filtrar sus queries por `sesion.user.colegioId` (regla multi-tenant).
 */
export async function requerirSesion() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // El contexto activo se recibe como un identificador opaco y siempre se
  // revalida contra la membresía del usuario. La cookie nunca concede acceso.
  const jar = await cookies();
  const solicitada = jar.get(COOKIE_CONTEXTO)?.value ?? sesion.user.membresiaId;
  let membresia = solicitada
    ? await prisma.membresia.findFirst({
        where: {
          id: solicitada,
          usuarioId: sesion.user.id,
          activa: true,
          usuario: { activo: true },
        },
        select: {
          id: true,
          rol: true,
          colegioId: true,
          colegio: { select: { nombre: true } },
        },
      })
    : null;

  // Una cookie inválida no bloquea otro perfil vigente, pero una membresía
  // revocada jamás conserva los permisos contenidos en el JWT anterior.
  if (!membresia) {
    membresia = await prisma.membresia.findFirst({
      where: {
        usuarioId: sesion.user.id,
        activa: true,
        usuario: { activo: true },
      },
      orderBy: { creadaEn: "asc" },
      select: {
        id: true,
        rol: true,
        colegioId: true,
        colegio: { select: { nombre: true } },
      },
    });
  }
  if (!membresia) redirect("/acceso-revocado");
  return {
    ...sesion,
    user: {
      ...sesion.user,
      membresiaId: membresia.id,
      rol: membresia.rol,
      colegioId: membresia.colegioId,
      colegioNombre: membresia.colegio.nombre,
    },
  };
}

/** Igual que requerirSesion pero exige uno de los roles indicados. */
export async function requerirRol(...roles: string[]) {
  const sesion = await requerirSesion();
  if (!roles.includes(sesion.user.rol)) redirect("/dashboard");
  return sesion;
}
