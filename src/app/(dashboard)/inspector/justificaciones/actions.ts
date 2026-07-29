"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { puedeRevisarJustificaciones } from "@/lib/justificaciones";
import { pareceDatoSensible } from "@/lib/anotaciones";
import { cifrarDetalleJustificacion } from "@/lib/cifrado-justificacion";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";

type Resultado = { ok: true } | { ok: false; error: string };

const revisionSchema = z
  .object({
    justificacionId: z.string().trim().min(1, "Justificación inválida."),
    decision: z.enum(["APROBADA", "RECHAZADA"]),
    fundamento: z.string().trim().max(500, "El fundamento no puede superar 500 caracteres.").optional().nullable(),
  })
  .superRefine((datos, ctx) => {
    if (datos.decision === "RECHAZADA" && (!datos.fundamento || datos.fundamento.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fundamento"],
        message: "Explica brevemente por qué se rechaza la justificación.",
      });
    }
  });

/**
 * Resuelve una justificación pendiente sin alterar la AsistenciaDiaria asociada.
 * La decisión, su evento histórico y la auditoría se guardan atómicamente.
 */
export async function revisarJustificacion(input: unknown): Promise<Resultado> {
  const { user } = await requerirSesion();
  if (!puedeRevisarJustificaciones(user.rol)) {
    return { ok: false, error: "No tienes permiso para revisar justificaciones." };
  }

  const parsed = revisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { justificacionId, decision } = parsed.data;
  const fundamento =
    parsed.data.fundamento?.trim() ||
    (decision === "APROBADA" ? "Antecedentes revisados y aceptados por Inspectoría." : null);
  if (fundamento && pareceDatoSensible(fundamento)) {
    return { ok: false, error: "El fundamento no debe incluir diagnósticos ni otros datos sensibles." };
  }
  let fundamentoCifrado: string | null = null;
  try {
    fundamentoCifrado = fundamento ? cifrarDetalleJustificacion(fundamento) : null;
  } catch {
    return { ok: false, error: "La revisión no puede guardarse hasta configurar el cifrado de datos sensibles." };
  }

  try {
    const estudianteId = await prisma.$transaction(async (tx) => {
      const actual = await tx.justificacionInasistencia.findFirst({
        where: {
          id: justificacionId,
          colegioId: user.colegioId,
          estudiante: { colegioId: user.colegioId },
        },
        select: { id: true, estudianteId: true, estado: true },
      });
      if (!actual) throw new Error("JUSTIFICACION_NO_ENCONTRADA");
      if (actual.estado !== "PENDIENTE") throw new Error("JUSTIFICACION_YA_REVISADA");

      const revisadaEn = new Date();
      const modificadas = await tx.justificacionInasistencia.updateMany({
        where: { id: actual.id, colegioId: user.colegioId, estado: "PENDIENTE" },
        data: {
          estado: decision,
          revisadaPorId: user.id,
          revisadaEn,
          fundamentoRevision: fundamentoCifrado,
        },
      });
      if (modificadas.count !== 1) throw new Error("JUSTIFICACION_YA_REVISADA");

      await tx.eventoJustificacion.create({
        data: {
          colegioId: user.colegioId,
          justificacionId: actual.id,
          estadoAnterior: "PENDIENTE",
          estadoNuevo: decision,
          actorId: user.id,
          fundamento: fundamentoCifrado,
        },
      });

      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "JustificacionInasistencia",
          entidadId: actual.id,
          antes: { estado: "PENDIENTE" },
          // El fundamento queda en el evento con acceso restringido, no se duplica en audit_log.
          despues: { estado: decision, revisadaPorId: user.id, revisadaEn: revisadaEn.toISOString() },
        },
        tx
      );

      return actual.estudianteId;
    });

    revalidatePath("/inspector/justificaciones");
    revalidatePath(`/mi-pupilo/${estudianteId}`);
    revalidatePath(`/admin/estudiantes/${estudianteId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "JUSTIFICACION_NO_ENCONTRADA") {
      return { ok: false, error: "Justificación no encontrada." };
    }
    if (error instanceof Error && error.message === "JUSTIFICACION_YA_REVISADA") {
      return { ok: false, error: "Esta justificación ya fue revisada. Actualiza la bandeja." };
    }
    return { ok: false, error: "No fue posible guardar la revisión. Intenta nuevamente." };
  }
}
