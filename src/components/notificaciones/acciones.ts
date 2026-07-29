"use server";

import { requerirSesion } from "@/lib/sesion";
import { marcarTodasLeidas } from "@/lib/notificaciones";

/** Marca como leídas todas las notificaciones del usuario en sesión. */
export async function marcarNotificacionesLeidas() {
  const sesion = await requerirSesion();
  await marcarTodasLeidas(sesion.user.id, sesion.user.colegioId);
}
