"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { puedeConfigurarColegio } from "./permisos";

const schema = z.object({ habilitada: z.boolean() });

const esquemaIdentidad = z.object({
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\//.test(v), "El logo debe ser una URL https://")
    .transform((v) => (v === "" ? null : v)),
  colorMarca: z
    .string()
    .trim()
    .refine((v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v), "Color inválido (usa formato #7442d2)")
    .transform((v) => (v === "" ? null : v.toLowerCase())),
});

/**
 * Identidad visual del colegio: logo y color de marca que tiñe la interfaz.
 * Solo ADMIN/DIRECTOR. El color se valida como hex estricto (nunca se inyecta
 * CSS arbitrario). Auditado.
 */
export async function actualizarIdentidad(
  input: unknown
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requerirSesion();
  if (!puedeConfigurarColegio(user.rol)) {
    return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  }
  const parsed = esquemaIdentidad.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const previo = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: { logoUrl: true, colorMarca: true },
  });

  await prisma.colegio.update({
    where: { id: user.colegioId },
    data: { logoUrl: parsed.data.logoUrl, colorMarca: parsed.data.colorMarca },
  });

  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "MODIFICAR",
    entidad: "Colegio",
    entidadId: user.colegioId,
    antes: { logoUrl: previo?.logoUrl ?? null, colorMarca: previo?.colorMarca ?? null },
    despues: parsed.data,
  });

  revalidatePath("/admin/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Activa/desactiva el aviso automático a apoderados al publicar calificaciones.
 * Solo ADMIN/DIRECTOR del colegio en sesión (multi-tenant). Auditado.
 */
export async function actualizarAvisoApoderados(
  input: unknown
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requerirSesion();
  if (!puedeConfigurarColegio(user.rol)) {
    return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dato inválido." };

  const previo = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: { notifsApoderadoHabilitada: true },
  });

  await prisma.colegio.update({
    where: { id: user.colegioId },
    data: { notifsApoderadoHabilitada: parsed.data.habilitada },
  });

  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "MODIFICAR",
    entidad: "Colegio",
    entidadId: user.colegioId,
    antes: { notifsApoderadoHabilitada: previo?.notifsApoderadoHabilitada ?? null },
    despues: { notifsApoderadoHabilitada: parsed.data.habilitada },
  });

  revalidatePath("/admin/configuracion");
  return { ok: true };
}

/**
 * Activa/desactiva el indicador DISCRETO de participación en PIE para el equipo
 * docente del curso (opt-in del colegio). No expone diagnóstico ni categoría de
 * NEE: solo el hecho de participación (Ley 21.719 / Decreto 170). Auditado.
 */
export async function actualizarIndicadorPie(
  input: unknown
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requerirSesion();
  if (!puedeConfigurarColegio(user.rol)) {
    return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dato inválido." };

  const previo = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: { indicadorPieDocentes: true },
  });

  await prisma.colegio.update({
    where: { id: user.colegioId },
    data: { indicadorPieDocentes: parsed.data.habilitada },
  });

  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "MODIFICAR",
    entidad: "Colegio",
    entidadId: user.colegioId,
    antes: { indicadorPieDocentes: previo?.indicadorPieDocentes ?? null },
    despues: { indicadorPieDocentes: parsed.data.habilitada },
  });

  revalidatePath("/admin/configuracion");
  return { ok: true };
}
