"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";

const payloadSchema = z.object({
  tokenHash: z.string().length(64),
  usuarioId: z.string().min(1),
  membresiaId: z.string().min(1),
  expiraEn: z.string().datetime(),
});

export async function activarPortalEstudiante(tokenCompuesto: string) {
  const separador = tokenCompuesto.indexOf(".");
  if (separador < 1) return { ok: false as const, error: "Invitación inválida." };
  const trabajoId = tokenCompuesto.slice(0, separador);
  const token = tokenCompuesto.slice(separador + 1);
  const trabajo = await prisma.trabajoOutbox.findFirst({
    where: { id: trabajoId, tipo: "INVITACION_PORTAL_ESTUDIANTE", estado: "PENDIENTE" },
    select: { id: true, colegioId: true, agregadoId: true, payloadMinimo: true },
  });
  const payload = payloadSchema.safeParse(trabajo?.payloadMinimo);
  if (!trabajo || !payload.success || new Date(payload.data.expiraEn) <= new Date()) {
    return { ok: false as const, error: "La invitación venció o ya fue utilizada." };
  }
  const recibido = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
  const esperado = Buffer.from(payload.data.tokenHash, "hex");
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return { ok: false as const, error: "Invitación inválida." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const reclamado = await tx.trabajoOutbox.updateMany({
        where: { id: trabajo.id, colegioId: trabajo.colegioId, tipo: "INVITACION_PORTAL_ESTUDIANTE", estado: "PENDIENTE" },
        data: { estado: "PROCESANDO", bloqueadoEn: new Date() },
      });
      if (reclamado.count !== 1) throw new Error("INVITACION_USADA");
      const acceso = await tx.accesoEstudiante.findFirst({
        where: { id: trabajo.agregadoId, colegioId: trabajo.colegioId, usuarioId: payload.data.usuarioId, activo: false, revocadoEn: null },
        select: { id: true, estudianteId: true },
      });
      if (!acceso) throw new Error("ACCESO_NO_DISPONIBLE");
      const membresia = await tx.membresia.updateMany({
        where: { id: payload.data.membresiaId, usuarioId: payload.data.usuarioId, colegioId: trabajo.colegioId, rol: "ESTUDIANTE", activa: false, revocadaEn: null },
        data: { activa: true },
      });
      if (membresia.count !== 1) throw new Error("MEMBRESIA_NO_DISPONIBLE");
      const cambio = await tx.accesoEstudiante.updateMany({
        where: { id: acceso.id, colegioId: trabajo.colegioId, usuarioId: payload.data.usuarioId, activo: false, revocadoEn: null },
        data: { activo: true },
      });
      if (cambio.count !== 1) throw new Error("ACCESO_CAMBIO");
      await tx.trabajoOutbox.update({ where: { id: trabajo.id }, data: { estado: "COMPLETADO", procesadoEn: new Date(), bloqueadoEn: null } });
      await registrarAuditoria({ colegioId: trabajo.colegioId, usuarioId: payload.data.usuarioId, accion: "MODIFICAR", entidad: "AccesoEstudiante", entidadId: acceso.id, antes: { activo: false }, despues: { activo: true, origen: "INVITACION_EMAIL", estudianteId: acceso.estudianteId } }, tx);
    });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "La invitación ya fue usada, revocada o cambió de estado." };
  }
}
