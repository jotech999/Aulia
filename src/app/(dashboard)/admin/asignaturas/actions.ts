"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { CLAVES_COLOR } from "@/lib/colores-asignatura";

type Resultado = { ok: true } | { ok: false; error: string };

// Solo dirección/UTP/admin configuran la identidad visual del colegio.
const ROLES_CONFIG = ["ADMIN", "DIRECTOR", "UTP"];

const schema = z.object({
  asignaturaId: z.string().min(1),
  // Una clave de la paleta, o null para volver a la convención por nombre.
  color: z
    .union([z.enum(CLAVES_COLOR as [string, ...string[]]), z.literal("")])
    .nullable()
    .transform((v) => (v ? v : null)),
});

/**
 * Configura el color de una asignatura (clave de paleta) para el colegio.
 * Aditivo y reversible: `null` restaura la convención por nombre. Verifica rol
 * y pertenencia al colegio (multi-tenant) y deja rastro en audit_log.
 */
export async function actualizarColorAsignatura(input: unknown): Promise<Resultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { asignaturaId, color } = parsed.data;

  const { user } = await requerirSesion();
  if (!ROLES_CONFIG.includes(user.rol)) {
    return { ok: false, error: "No tienes permiso para configurar colores." };
  }

  // Multi-tenant: la asignatura debe pertenecer al colegio de la sesión.
  const asignatura = await prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId: user.colegioId },
    select: { id: true, color: true },
  });
  if (!asignatura) return { ok: false, error: "Asignatura no encontrada." };

  if (asignatura.color === color) return { ok: true }; // sin cambios

  await prisma.$transaction(async (tx) => {
    await tx.asignatura.update({
      where: { id: asignatura.id },
      data: { color },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "MODIFICAR",
        entidad: "Asignatura",
        entidadId: asignatura.id,
        antes: { color: asignatura.color },
        despues: { color },
      },
      tx
    );
  });

  revalidatePath("/admin/asignaturas");
  return { ok: true };
}
