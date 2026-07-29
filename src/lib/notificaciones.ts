import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { enviarEmail, plantillaAviso } from "./email";
import { enviarPushMuchos } from "./push";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * Avisa a un conjunto de usuarios (apoderados) por los tres canales, en orden:
 * campana (in-app) siempre; luego Web Push; y email como respaldo SOLO a quienes
 * no tienen push activo. Best-effort.
 */
async function avisarPorCanales(
  colegioId: string,
  usuarios: { id: string; email: string }[],
  base: { tipo: NuevaNotificacion["tipo"]; titulo: string; cuerpo?: string; enlace?: string },
  colegioNombre = ""
): Promise<{ inApp: number; push: number; email: number }> {
  if (usuarios.length === 0) return { inApp: 0, push: 0, email: 0 };
  await crearNotificaciones(usuarios.map((u) => ({ colegioId, usuarioId: u.id, ...base })));
  const { conPush, sinPush } = await enviarPushMuchos(
    colegioId,
    usuarios.map((u) => u.id),
    { titulo: base.titulo, cuerpo: base.cuerpo, enlace: base.enlace }
  );
  const sinPushSet = new Set(sinPush);
  let email = 0;
  for (const u of usuarios) {
    if (!sinPushSet.has(u.id)) continue; // ya recibió push
    const ok = await enviarEmail({
      to: u.email,
      subject: base.titulo,
      html: plantillaAviso(base.titulo, base.cuerpo ?? "", colegioNombre),
    });
    if (ok) email++;
  }
  return { inApp: usuarios.length, push: conPush.length, email };
}

export type NuevaNotificacion = {
  colegioId: string;
  usuarioId: string;
  tipo: "EVALUACION" | "CALIFICACION" | "COMUNICADO" | "GENERAL";
  titulo: string;
  cuerpo?: string;
  enlace?: string;
};

/** ¿El colegio tiene activado el aviso automático a apoderados? (ON por defecto). */
export async function notificacionesApoderadoActivas(colegioId: string): Promise<boolean> {
  const c = await prisma.colegio.findUnique({
    where: { id: colegioId },
    select: { notifsApoderadoHabilitada: true },
  });
  return c?.notifsApoderadoHabilitada ?? true;
}

/** Crea varias notificaciones de una vez. No lanza si el arreglo está vacío. */
export async function crearNotificaciones(
  datos: NuevaNotificacion[],
  cliente: Cliente = prisma
) {
  if (datos.length === 0) return;
  await cliente.notificacion.createMany({ data: datos });
}

export function contarNoLeidas(usuarioId: string, colegioId: string) {
  return prisma.notificacion.count({ where: { usuarioId, colegioId, leidaEn: null } });
}

export function listarNotificaciones(usuarioId: string, colegioId: string, limite = 20) {
  return prisma.notificacion.findMany({
    where: { usuarioId, colegioId },
    orderBy: { creadaEn: "desc" },
    take: limite,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      cuerpo: true,
      enlace: true,
      leidaEn: true,
      creadaEn: true,
    },
  });
}

export async function marcarTodasLeidas(usuarioId: string, colegioId: string) {
  await prisma.notificacion.updateMany({
    where: { usuarioId, colegioId, leidaEn: null },
    data: { leidaEn: new Date() },
  });
}

/**
 * Notifica a los apoderados de un estudiante. Best-effort. `enlace` es opcional
 * (el apoderado puede no tener una pantalla de detalle para ciertos eventos).
 */
export async function notificarApoderadosDeEstudiante(
  colegioId: string,
  estudianteId: string,
  base: { tipo: NuevaNotificacion["tipo"]; titulo: string; cuerpo?: string; enlace?: string }
) {
  try {
    if (!(await notificacionesApoderadoActivas(colegioId))) return;
    const apoderados = await prisma.apoderado.findMany({
      where: { estudianteId, estudiante: { colegioId } },
      select: { usuario: { select: { id: true, email: true } } },
      distinct: ["usuarioId"],
    });
    await avisarPorCanales(colegioId, apoderados.map((a) => a.usuario), base);
  } catch {
    // Accesorio: no afecta la operación principal.
  }
}

/**
 * Aviso automático al publicar una calificación: notifica (campana + email) a
 * los apoderados del estudiante y deja traza del envío. Respeta el flag del
 * colegio. Minimización: el email NO incluye la nota (se ve en la plataforma).
 * Devuelve el resumen de envíos para auditoría.
 */
export async function notificarCalificacionApoderados(
  colegioId: string,
  estudianteId: string,
  ctx: { asignatura: string; evaluacion: string; pupilo: string; colegioNombre: string }
): Promise<{ inApp: number; emails: number; push: number }> {
  try {
    if (!(await notificacionesApoderadoActivas(colegioId))) return { inApp: 0, emails: 0, push: 0 };
    const apoderados = await prisma.apoderado.findMany({
      where: { estudianteId, estudiante: { colegioId } },
      select: { usuario: { select: { id: true, email: true } } },
      distinct: ["usuarioId"],
    });

    // Web Push primero; email SOLO como respaldo a quienes no tienen push.
    const { conPush } = await enviarPushMuchos(
      colegioId,
      apoderados.map((a) => a.usuario.id),
      { titulo: `Nueva calificación de ${ctx.pupilo}`, cuerpo: `${ctx.asignatura} · ${ctx.evaluacion}`, enlace: `/mi-pupilo/${estudianteId}` }
    );
    const conPushSet = new Set(conPush);

    let emails = 0;
    for (const a of apoderados) {
      const okEmail = conPushSet.has(a.usuario.id)
        ? false
        : await enviarEmail({
            to: a.usuario.email,
            subject: `Nueva calificación de ${ctx.pupilo}`,
            html: plantillaAviso(
              `Nueva calificación de ${ctx.pupilo}`,
              `Se registró una calificación en ${ctx.asignatura} (${ctx.evaluacion}).`,
              ctx.colegioNombre
            ),
          });
      if (okEmail) emails++;
      await prisma.notificacion.create({
        data: {
          colegioId,
          usuarioId: a.usuario.id,
          tipo: "CALIFICACION",
          titulo: `Nueva calificación: ${ctx.asignatura}`,
          cuerpo: ctx.evaluacion,
          enlace: `/mi-pupilo/${estudianteId}`,
          emailEnviadoEn: okEmail ? new Date() : null,
        },
      });
    }
    return { inApp: apoderados.length, emails, push: conPush.length };
  } catch {
    return { inApp: 0, emails: 0, push: 0 };
  }
}

/**
 * Genera notificaciones para los apoderados de los estudiantes con matrícula
 * activa en un curso. Best-effort: nunca debe bloquear la acción que la origina.
 */
export async function notificarApoderadosDeCurso(
  colegioId: string,
  cursoId: string,
  base: { tipo: NuevaNotificacion["tipo"]; titulo: string; cuerpo?: string; enlace?: string }
) {
  try {
    if (!(await notificacionesApoderadoActivas(colegioId))) return;
    const apoderados = await prisma.apoderado.findMany({
      where: {
        estudiante: {
          colegioId,
          matriculas: { some: { cursoId, estado: "ACTIVA" } },
        },
      },
      select: { usuario: { select: { id: true, email: true } } },
      distinct: ["usuarioId"],
    });
    await avisarPorCanales(colegioId, apoderados.map((a) => a.usuario), base);
  } catch {
    // La notificación es accesoria: si falla, no afecta la operación principal.
  }
}

/** Avisa a TODOS los apoderados del colegio (p. ej. un evento del calendario). */
export async function notificarApoderadosDeColegio(
  colegioId: string,
  base: { tipo: NuevaNotificacion["tipo"]; titulo: string; cuerpo?: string; enlace?: string }
) {
  try {
    if (!(await notificacionesApoderadoActivas(colegioId))) return;
    const apoderados = await prisma.apoderado.findMany({
      where: {
        estudiante: { colegioId, matriculas: { some: { estado: "ACTIVA" } } },
      },
      select: { usuario: { select: { id: true, email: true } } },
      distinct: ["usuarioId"],
    });
    await avisarPorCanales(colegioId, apoderados.map((a) => a.usuario), base);
  } catch {
    // La notificación es accesoria: si falla, no afecta la operación principal.
  }
}
