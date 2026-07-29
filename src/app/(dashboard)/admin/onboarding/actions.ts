"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { pasoOnboardingSchema } from "@/lib/onboarding";

const ROLES = new Set(["ADMIN", "DIRECTOR"]);

export async function guardarAvanceOnboarding(input: unknown) {
  const parsed = pasoOnboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Paso inválido." };
  const { user } = await requerirSesion();
  if (!ROLES.has(user.rol)) return { ok: false as const, error: "No tienes permiso para configurar el colegio." };
  const ahora = new Date();
  try {
    const previo = await prisma.onboardingColegio.findUnique({ where: { colegioId: user.colegioId }, select: { id: true, estado: true, pasoActual: true } });
    const completo = parsed.data === "FINAL";
    const guardado = await prisma.$transaction(async (tx) => {
      const fila = await tx.onboardingColegio.upsert({
        where: { colegioId: user.colegioId },
        create: { colegioId: user.colegioId, estado: completo ? "COMPLETADO" : "EN_PROGRESO", pasoActual: parsed.data, iniciadoPorId: user.id, iniciadoEn: ahora, completadoEn: completo ? ahora : null },
        update: { estado: completo ? "COMPLETADO" : "EN_PROGRESO", pasoActual: parsed.data, iniciadoPorId: previo ? undefined : user.id, iniciadoEn: previo ? undefined : ahora, completadoEn: completo ? ahora : null },
        select: { id: true, estado: true, pasoActual: true },
      });
      await registrarAuditoria({ colegioId: user.colegioId, usuarioId: user.id, accion: previo ? "MODIFICAR" : "CREAR", entidad: "OnboardingColegio", entidadId: fila.id, antes: previo ? { estado: previo.estado, pasoActual: previo.pasoActual } : undefined, despues: { estado: fila.estado, pasoActual: fila.pasoActual } }, tx);
      return fila;
    });
    revalidatePath("/admin/onboarding");
    revalidatePath("/dashboard");
    return { ok: true as const, estado: guardado.estado };
  } catch {
    return { ok: false as const, error: "No se pudo guardar el avance." };
  }
}
