"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";

const suscripcionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

type Resultado = { ok: true } | { ok: false; error: string };

/** Guarda (o actualiza) la suscripción Web Push del usuario en sesión. */
export async function guardarSuscripcion(input: unknown): Promise<Resultado> {
  const parsed = suscripcionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Suscripción inválida." };
  const { user } = await requerirSesion();
  const { endpoint, keys } = parsed.data;
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { usuarioId: user.id, colegioId: user.colegioId, p256dh: keys.p256dh, auth: keys.auth },
      create: { usuarioId: user.id, colegioId: user.colegioId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar la suscripción." };
  }
}

/** Elimina la suscripción del navegador actual (al desactivar). */
export async function eliminarSuscripcion(endpoint: string): Promise<Resultado> {
  const { user } = await requerirSesion();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, usuarioId: user.id } }).catch(() => {});
  return { ok: true };
}
