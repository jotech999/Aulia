"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { enviarEmail, plantillaAviso } from "@/lib/email";

const ROLES_ADMISION = new Set(["ADMIN", "DIRECTOR"]);

const esquema = z.object({
  id: z.string().min(1),
  estado: z.enum(["EN_REVISION", "ACEPTADA", "RECHAZADA", "MATRICULADA"]),
});

/**
 * Cambia el estado de una postulación. Al ACEPTAR se avisa por correo al
 * apoderado (best-effort, sin datos sensibles). Multi-tenant + auditado.
 */
export async function actualizarPostulacion(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = esquema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { user } = await requerirSesion();
  if (!ROLES_ADMISION.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para gestionar admisión." };
  }

  const post = await prisma.postulacion.findFirst({
    where: { id: parsed.data.id, colegioId: user.colegioId },
    select: { id: true, estado: true, email: true, nivelSolicitado: true, apoderadoNombre: true },
  });
  if (!post) return { ok: false, error: "La postulación no existe." };

  await prisma.postulacion.update({
    where: { id: post.id },
    data: { estado: parsed.data.estado },
  });

  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "MODIFICAR",
    entidad: "Postulacion",
    entidadId: post.id,
    antes: { estado: post.estado },
    despues: { estado: parsed.data.estado },
  });

  // Correo al apoderado en los hitos que le importan (best-effort).
  const colegio = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: { nombre: true },
  });
  if (parsed.data.estado === "ACEPTADA") {
    await enviarEmail({
      to: post.email,
      subject: `Postulación aceptada · ${colegio?.nombre ?? ""}`,
      html: plantillaAviso(
        "¡Postulación aceptada!",
        `La postulación a ${post.nivelSolicitado} fue aceptada. El colegio se contactará contigo para coordinar la matrícula.`,
        colegio?.nombre ?? ""
      ),
    });
  } else if (parsed.data.estado === "RECHAZADA") {
    await enviarEmail({
      to: post.email,
      subject: `Resultado de postulación · ${colegio?.nombre ?? ""}`,
      html: plantillaAviso(
        "Resultado de tu postulación",
        `Lamentamos informarte que la postulación a ${post.nivelSolicitado} no fue aceptada en este proceso. Agradecemos tu interés.`,
        colegio?.nombre ?? ""
      ),
    });
  }

  revalidatePath("/admin/admision");
  return { ok: true };
}
