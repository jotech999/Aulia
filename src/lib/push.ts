/**
 * Envío de Web Push (PWA) a los navegadores suscritos de un usuario.
 * Si no hay claves VAPID configuradas, queda desactivado silenciosamente y todos
 * los usuarios se reportan "sin push" para que el llamador use el fallback email.
 * Server-only.
 */
import webpush from "web-push";
import { prisma } from "./prisma";

let configurado = false;
function configurar(): boolean {
  if (configurado) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:soporte@educhile.cl", pub, priv);
  configurado = true;
  return true;
}

export function pushHabilitado(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export type PushPayload = { titulo: string; cuerpo?: string; enlace?: string };

/**
 * Envía un push a todos los usuarios dados (a todas sus suscripciones).
 * Devuelve los usuarioIds que quedaron SIN push (sin suscripción o push apagado),
 * para que el llamador les envíe email como respaldo.
 */
export async function enviarPushMuchos(
  colegioId: string,
  usuarioIds: string[],
  payload: PushPayload
): Promise<{ conPush: string[]; sinPush: string[] }> {
  const ids = [...new Set(usuarioIds)];
  if (ids.length === 0) return { conPush: [], sinPush: [] };
  if (!configurar()) return { conPush: [], sinPush: ids };

  const subs = await prisma.pushSubscription.findMany({
    where: { colegioId, usuarioId: { in: ids } },
    select: { id: true, usuarioId: true, endpoint: true, p256dh: true, auth: true },
  });

  const conPush = new Set<string>();
  const muertas: string[] = [];
  const data = JSON.stringify({
    title: payload.titulo,
    body: payload.cuerpo ?? "",
    url: payload.enlace ?? "/dashboard",
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data
        );
        conPush.add(s.usuarioId);
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) muertas.push(s.id); // suscripción caducada
      }
    })
  );

  if (muertas.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: muertas } } }).catch(() => {});
  }
  return { conPush: [...conPush], sinPush: ids.filter((u) => !conPush.has(u)) };
}
