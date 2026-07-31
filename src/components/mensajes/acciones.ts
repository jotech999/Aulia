"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { participacionEnHilo } from "@/lib/mensajes";
import { notificarApoderadosDeEstudiante, crearNotificaciones } from "@/lib/notificaciones";
import { sugerirRespuestaMensaje, type ResultadoRespuesta } from "@/lib/ia/respuesta-mensaje";

type Resultado = { ok: true } | { ok: false; error: string };

const schema = z.object({
  estudianteId: z.string().min(1),
  cuerpo: z.string().trim().min(1, "Escribe un mensaje.").max(2000),
});

/**
 * Envía un mensaje directo en el hilo de un estudiante (apoderado ↔ profesor jefe).
 * Verifica la participación (multi-tenant + pertenencia) y avisa a la contraparte.
 */
export async function enviarMensaje(input: unknown): Promise<Resultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { estudianteId, cuerpo } = parsed.data;

  const { user } = await requerirSesion();
  const part = await participacionEnHilo(user, estudianteId);
  if (!part) return { ok: false, error: "No puedes conversar sobre este estudiante." };

  await prisma.mensajeDirecto.create({
    data: {
      colegioId: user.colegioId,
      estudianteId,
      autorId: user.id,
      deApoderado: part.esApoderado,
      cuerpo,
    },
  });

  const extracto = cuerpo.length > 120 ? `${cuerpo.slice(0, 117)}…` : cuerpo;

  if (part.esApoderado) {
    // Apoderado → profesor jefe del curso.
    const est = await prisma.estudiante.findFirst({
      where: { id: estudianteId, colegioId: user.colegioId },
      select: {
        nombres: true,
        matriculas: {
          where: { estado: "ACTIVA" },
          select: { curso: { select: { profesorJefeId: true } } },
          take: 1,
        },
      },
    });
    const jefeId = est?.matriculas[0]?.curso.profesorJefeId;
    if (jefeId) {
      await crearNotificaciones([
        {
          colegioId: user.colegioId,
          usuarioId: jefeId,
          tipo: "GENERAL",
          titulo: `Mensaje del apoderado de ${est?.nombres?.split(" ")[0] ?? "un estudiante"}`,
          cuerpo: extracto,
          enlace: `/admin/estudiantes/${estudianteId}#mensajes`,
        },
      ]);
    }
  } else {
    // Docente → apoderados del estudiante.
    await notificarApoderadosDeEstudiante(user.colegioId, estudianteId, {
      tipo: "GENERAL",
      titulo: "Mensaje del profesor",
      cuerpo: extracto,
      enlace: `/mi-pupilo/${estudianteId}#mensajes`,
    });
  }

  revalidatePath(`/mi-pupilo/${estudianteId}`);
  revalidatePath(`/admin/estudiantes/${estudianteId}`);
  return { ok: true };
}

/** Marca como leídos los mensajes de la contraparte al abrir el hilo. */
export async function marcarHiloLeido(estudianteId: string): Promise<void> {
  const { user } = await requerirSesion();
  const part = await participacionEnHilo(user, estudianteId);
  if (!part) return;
  await prisma.mensajeDirecto.updateMany({
    where: {
      colegioId: user.colegioId,
      estudianteId,
      deApoderado: !part.esApoderado, // los que envió la contraparte
      leidoEn: null,
    },
    data: { leidoEn: new Date() },
  });
}

/**
 * Sugerencia de respuesta con IA para el STAFF del hilo (nunca el apoderado):
 * valida la participación y delega en el agente, que solo ve el hilo.
 */
export async function sugerirRespuesta(estudianteId: string): Promise<ResultadoRespuesta> {
  const { user } = await requerirSesion();
  if (user.rol === "APODERADO" || user.rol === "ESTUDIANTE") {
    return { ok: false, error: "La sugerencia es para el equipo del colegio." };
  }
  const part = await participacionEnHilo(user, estudianteId);
  if (!part) return { ok: false, error: "No puedes conversar sobre este estudiante." };
  return sugerirRespuestaMensaje({ id: user.id, rol: user.rol, colegioId: user.colegioId }, estudianteId);
}
