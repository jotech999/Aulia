"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { ROLES_RESOLVER_PROMOCION } from "@/lib/promocion";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const schema = z.object({
  estudianteId: z.string().min(1).max(40),
  anioEscolarId: z.string().min(1).max(40),
  estado: z.enum(["PROMOVIDO", "REPITE", "ANALISIS"]),
  estadoPropuesto: z.enum(["PROMOVIDO", "REPITE", "ANALISIS"]),
  fundamento: z
    .string()
    .trim()
    .min(20, "El fundamento debe explicar la decisión (mínimo 20 caracteres).")
    .max(4000),
  promedioGeneral: z.number().finite().min(1).max(7).nullable().optional(),
  asistencia: z.number().int().min(0).max(100).nullable().optional(),
});

/**
 * Registra la RESOLUCIÓN DE PROMOCIÓN de un estudiante (Decreto 67, art. 11).
 * Solo dirección firma; el fundamento es obligatorio y todo queda auditado.
 * Es idempotente por (año escolar, estudiante): re-resolver actualiza y deja
 * el cambio en la auditoría.
 */
export async function resolverPromocion(input: unknown): Promise<Resultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const datos = parsed.data;

  const { user } = await requerirSesion();
  if (!ROLES_RESOLVER_PROMOCION.has(user.rol)) {
    return {
      ok: false,
      error: "Solo dirección puede firmar la resolución de promoción (Decreto 67, art. 11).",
    };
  }

  // Multi-tenant: el estudiante y el año escolar deben ser del colegio en sesión.
  const [estudiante, anio] = await Promise.all([
    prisma.estudiante.findFirst({
      where: { id: datos.estudianteId, colegioId: user.colegioId },
      select: { id: true },
    }),
    prisma.anioEscolar.findFirst({
      where: { id: datos.anioEscolarId, colegioId: user.colegioId },
      select: { id: true },
    }),
  ]);
  if (!estudiante || !anio) return { ok: false, error: "Estudiante o año escolar no encontrado." };

  const previa = await prisma.resolucionPromocion.findUnique({
    where: {
      anioEscolarId_estudianteId: {
        anioEscolarId: datos.anioEscolarId,
        estudianteId: datos.estudianteId,
      },
    },
    select: { estado: true, fundamento: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.resolucionPromocion.upsert({
      where: {
        anioEscolarId_estudianteId: {
          anioEscolarId: datos.anioEscolarId,
          estudianteId: datos.estudianteId,
        },
      },
      create: {
        colegioId: user.colegioId,
        anioEscolarId: datos.anioEscolarId,
        estudianteId: datos.estudianteId,
        estado: datos.estado,
        estadoPropuesto: datos.estadoPropuesto,
        fundamento: datos.fundamento,
        promedioGeneral: datos.promedioGeneral ?? null,
        asistencia: datos.asistencia ?? null,
        resueltoPorId: user.id,
      },
      update: {
        estado: datos.estado,
        estadoPropuesto: datos.estadoPropuesto,
        fundamento: datos.fundamento,
        promedioGeneral: datos.promedioGeneral ?? null,
        asistencia: datos.asistencia ?? null,
        resueltoPorId: user.id,
        resueltoEn: new Date(),
      },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: previa ? "MODIFICAR" : "FIRMAR",
        entidad: "ResolucionPromocion",
        entidadId: datos.estudianteId,
        antes: previa ? { estado: previa.estado } : undefined,
        despues: {
          estado: datos.estado,
          estadoPropuesto: datos.estadoPropuesto,
          difiereDeLaPropuesta: datos.estado !== datos.estadoPropuesto,
        },
      },
      tx
    );
  });

  revalidatePath("/cierre-anual");
  return { ok: true };
}

/**
 * Redacta con IA el borrador del informe fundado del Art. 11 para un caso que
 * quedó en análisis. Devuelve texto editable: la persona lo revisa y recién
 * ahí lo guarda como fundamento de la resolución.
 */
export async function borradorFundamentoIA(input: unknown): Promise<Resultado<{ borrador: string }>> {
  const datos = input as { estudianteId?: unknown; anioEscolarId?: unknown };
  const estudianteId = typeof datos.estudianteId === "string" ? datos.estudianteId : "";
  const anioEscolarId = typeof datos.anioEscolarId === "string" ? datos.anioEscolarId : "";
  if (!estudianteId || !anioEscolarId) return { ok: false, error: "Datos inválidos." };

  const { user } = await requerirSesion();
  if (!ROLES_RESOLVER_PROMOCION.has(user.rol) && user.rol !== "UTP") {
    return { ok: false, error: "No tienes permiso para el cierre anual." };
  }

  const { generarFundamentoPromocion } = await import("@/lib/ia/promocion");
  return generarFundamentoPromocion(user, { estudianteId, anioEscolarId });
}
