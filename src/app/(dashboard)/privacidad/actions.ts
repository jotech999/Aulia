"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { calcularVencimientoInterno, solicitudPrivacidadSchema } from "@/lib/privacidad";
import { z } from "zod";

const resolverSchema = z.object({
  solicitudId: z.string().min(1),
  estado: z.enum(["VERIFICANDO_IDENTIDAD", "EN_PROCESO", "RESPONDIDA", "RECHAZADA"]),
  nota: z.string().trim().min(10).max(1200),
});

export async function crearSolicitudPrivacidad(input: unknown) {
  const parsed = solicitudPrivacidadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { user } = await requerirSesion();
  try {
    const solicitud = await prisma.$transaction(async (tx) => {
      const creada = await tx.solicitudTitular.create({
        data: {
          colegioId: user.colegioId,
          titularUsuarioId: user.id,
          tipo: parsed.data.tipo,
          descripcion: parsed.data.descripcion,
          vencimientoEn: calcularVencimientoInterno(),
          eventos: {
            create: {
              colegioId: user.colegioId,
              actorId: user.id,
              estadoNuevo: "RECIBIDA",
              nota: "Solicitud recibida desde el portal.",
            },
          },
        },
        select: { id: true, tipo: true },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "CREAR",
          entidad: "SolicitudTitular",
          entidadId: creada.id,
          despues: { tipo: creada.tipo, estado: "RECIBIDA", canal: "PORTAL" },
        },
        tx
      );
      return creada;
    });
    revalidatePath("/privacidad");
    return { ok: true as const, id: solicitud.id };
  } catch {
    return { ok: false as const, error: "No pudimos registrar la solicitud. Intenta nuevamente." };
  }
}

export async function actualizarSolicitudPrivacidad(input: unknown) {
  const parsed = resolverSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Incluye una explicación clara de al menos 10 caracteres." };
  const { user } = await requerirSesion();
  if (!["ADMIN", "DIRECTOR"].includes(user.rol)) return { ok: false as const, error: "No tienes permiso para gestionar solicitudes." };
  const previa = await prisma.solicitudTitular.findFirst({
    where: { id: parsed.data.solicitudId, colegioId: user.colegioId },
    select: { id: true, estado: true, tipo: true },
  });
  if (!previa || ["RESPONDIDA", "RECHAZADA", "CANCELADA"].includes(previa.estado)) return { ok: false as const, error: "La solicitud ya está cerrada o no existe." };
  const transiciones: Record<string, string[]> = {
    RECIBIDA: ["VERIFICANDO_IDENTIDAD"],
    VERIFICANDO_IDENTIDAD: ["EN_PROCESO", "RECHAZADA"],
    EN_PROCESO: ["RESPONDIDA", "RECHAZADA"],
  };
  if (!transiciones[previa.estado]?.includes(parsed.data.estado)) {
    return { ok: false as const, error: "Completa la verificación de identidad y las etapas previas antes de cerrar el caso." };
  }
  const cerrada = ["RESPONDIDA", "RECHAZADA"].includes(parsed.data.estado);
  try {
    await prisma.$transaction(async (tx) => {
      const cambio = await tx.solicitudTitular.updateMany({
        where: { id: previa.id, colegioId: user.colegioId, estado: previa.estado },
        data: {
          estado: parsed.data.estado,
          responsableId: user.id,
          respuesta: cerrada ? parsed.data.nota : undefined,
          codigoMotivo: parsed.data.estado === "RECHAZADA" ? "FUNDAMENTO_REGISTRADO" : undefined,
          resueltaEn: cerrada ? new Date() : null,
        },
      });
      if (cambio.count !== 1) throw new Error("CONFLICTO");
      await tx.eventoSolicitudTitular.create({ data: { colegioId: user.colegioId, solicitudId: previa.id, actorId: user.id, estadoAnterior: previa.estado, estadoNuevo: parsed.data.estado, nota: parsed.data.nota } });
      await registrarAuditoria({ colegioId: user.colegioId, usuarioId: user.id, accion: "MODIFICAR", entidad: "SolicitudTitular", entidadId: previa.id, antes: { estado: previa.estado, tipo: previa.tipo }, despues: { estado: parsed.data.estado, tipo: previa.tipo, conFundamento: true } }, tx);
    });
    revalidatePath("/privacidad");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "La solicitud cambió mientras la revisabas. Actualiza e inténtalo de nuevo." };
  }
}
