"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COOKIE_CONTEXTO } from "@/lib/sesion";

const schema = z.object({ membresiaId: z.string().min(1) });

/**
 * Cambia el perfil operativo. La cookie solo recuerda la elección; el servidor
 * comprueba que siga siendo una membresía activa del usuario autenticado.
 */
export async function cambiarContexto(input: unknown) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Perfil inválido." };

  const membresia = await prisma.membresia.findFirst({
    where: {
      id: parsed.data.membresiaId,
      usuarioId: sesion.user.id,
      activa: true,
      usuario: { activo: true },
    },
    select: { id: true },
  });
  if (!membresia) {
    return { ok: false as const, error: "Ese perfil ya no está disponible." };
  }

  const jar = await cookies();
  jar.set(COOKIE_CONTEXTO, membresia.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect("/dashboard");
}
