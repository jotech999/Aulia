"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { esFechaISOValida, fechaDesdeISO } from "@/lib/fecha";
import { registrarAuditoria } from "@/lib/auditoria";
import { pareceDatoSensible } from "@/lib/anotaciones";
import { cifrarDetalleJustificacion } from "@/lib/cifrado-justificacion";
import { MOTIVOS_JUSTIFICACION } from "@/lib/justificaciones";

type Resultado = { ok: true } | { ok: false; error: string };

const schema = z.object({
  estudianteId: z.string().min(1),
  fecha: z.string().refine(esFechaISOValida, "Fecha inválida"),
  motivo: z.enum(MOTIVOS_JUSTIFICACION),
  detalle: z.string().trim().max(300).optional().nullable(),
});

/**
 * El apoderado justifica una inasistencia (día AUSENTE) de su pupilo. No modifica
 * el registro de asistencia del profesor: crea un documento que el profesor jefe
 * puede revisar. Verifica pertenencia (multi-tenant) y que exista la inasistencia.
 */
export async function justificarInasistencia(input: unknown): Promise<Resultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { estudianteId, fecha, motivo, detalle } = parsed.data;

  const { user } = await requerirSesion();
  if (user.rol !== "APODERADO") {
    return { ok: false, error: "Solo el apoderado puede justificar inasistencias." };
  }

  // El estudiante debe ser pupilo del apoderado en sesión.
  const est = await prisma.estudiante.findFirst({
    where: {
      id: estudianteId,
      colegioId: user.colegioId,
      apoderados: { some: { usuarioId: user.id } },
    },
    select: { id: true },
  });
  if (!est) return { ok: false, error: "Estudiante no encontrado." };

  const fechaD = fechaDesdeISO(fecha);
  if (motivo === "Salud" && detalle) {
    return { ok: false, error: "Por privacidad, selecciona Salud sin escribir diagnósticos ni antecedentes médicos." };
  }
  if (detalle && pareceDatoSensible(detalle)) {
    return { ok: false, error: "El detalle parece contener datos sensibles. Describe solo el antecedente administrativo." };
  }
  let motivoCifrado: string;
  let detalleCifrado: string | null = null;
  try {
    motivoCifrado = cifrarDetalleJustificacion(motivo);
    detalleCifrado = detalle ? cifrarDetalleJustificacion(detalle) : null;
  } catch {
    return { ok: false, error: "El detalle no puede guardarse hasta configurar el cifrado de datos sensibles." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // El lock impide que la ausencia sea corregida a PRESENTE mientras se
      // crea el documento que la justifica.
      const ausencias = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "AsistenciaDiaria"
        WHERE "colegioId" = ${user.colegioId}
          AND "estudianteId" = ${estudianteId}
          AND "fecha" = ${fechaD}
          AND "estado" = 'AUSENTE'
        FOR UPDATE
      `);
      const ausencia = ausencias[0];
      if (!ausencia) throw new Error("AUSENCIA_NO_EXISTE");

      // Compatibilidad con registros previos a la relación 1:1 con asistencia.
      const ya = await tx.justificacionInasistencia.findFirst({
        where: { colegioId: user.colegioId, estudianteId, fecha: fechaD },
        select: { id: true },
      });
      if (ya) throw new Error("JUSTIFICACION_DUPLICADA");

      const creada = await tx.justificacionInasistencia.create({
        data: {
          colegioId: user.colegioId,
          estudianteId,
          asistenciaDiariaId: ausencia.id,
          fecha: fechaD,
          motivo: motivoCifrado,
          detalle: detalleCifrado,
          estado: "PENDIENTE",
          creadaPorId: user.id,
        },
        select: { id: true },
      });

      await tx.eventoJustificacion.create({
        data: {
          colegioId: user.colegioId,
          justificacionId: creada.id,
          estadoAnterior: null,
          estadoNuevo: "PENDIENTE",
          actorId: user.id,
        },
      });

      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "CREAR",
          entidad: "JustificacionInasistencia",
          entidadId: creada.id,
          // Traza mínima: no duplicar motivo, detalle ni antecedentes familiares.
          despues: { estado: "PENDIENTE", asistenciaDiariaId: ausencia.id },
        },
        tx
      );
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === "AUSENCIA_NO_EXISTE") {
      return { ok: false, error: "No hay una inasistencia registrada ese día." };
    }
    if (
      (error instanceof Error && error.message === "JUSTIFICACION_DUPLICADA") ||
      (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
    ) {
      return { ok: false, error: "Esa inasistencia ya fue justificada." };
    }
    return { ok: false, error: "No fue posible enviar la justificación. Intenta nuevamente." };
  }

  revalidatePath(`/mi-pupilo/${estudianteId}`);
  revalidatePath("/inspector/justificaciones");
  return { ok: true };
}
