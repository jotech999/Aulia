"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  proponerPaci,
  redactarInformeFamilia,
  ROLES_PIE_IA,
  type ResultadoInformePie,
  type ResultadoPaci,
} from "@/lib/ia/pie";

/**
 * Acciones de IA del módulo PIE.
 *
 * El texto de la situación educativa lo envía la profesional desde la pantalla
 * (lo ve, lo edita y decide qué mandar): la plataforma no lee la ficha cifrada
 * por su cuenta para despacharla a un modelo. Aquí se re-verifica el rol y que
 * el/la estudiante pertenezca al colegio de la sesión.
 */

const esquemaPaci = z.object({
  estudianteId: z.string().min(1),
  situacion: z
    .string()
    .trim()
    .min(30, "Describe con un poco más de detalle qué necesita el/la estudiante")
    .max(4000),
  apoyosActuales: z.string().trim().max(2000).optional(),
});

const esquemaInforme = z.object({
  estudianteId: z.string().min(1),
  periodo: z.string().trim().min(2, "Indica el período").max(60),
  avances: z.string().trim().min(20, "Cuenta qué se trabajó y qué avances hubo").max(4000),
});

async function autorizar(estudianteId: string) {
  const { user } = await requerirSesion();
  if (!ROLES_PIE_IA.has(user.rol)) {
    return { ok: false as const, error: "No tienes acceso a los registros PIE." };
  }
  const est = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: user.colegioId },
    select: { id: true },
  });
  if (!est) return { ok: false as const, error: "Estudiante no encontrado en este colegio." };
  return { ok: true as const, user };
}

export async function proponerPaciIA(input: unknown): Promise<ResultadoPaci> {
  const parsed = esquemaPaci.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const auth = await autorizar(parsed.data.estudianteId);
  if (!auth.ok) return { ok: false, error: auth.error };

  return proponerPaci(
    { id: auth.user.id, rol: auth.user.rol, colegioId: auth.user.colegioId },
    parsed.data
  );
}

export async function redactarInformePieIA(input: unknown): Promise<ResultadoInformePie> {
  const parsed = esquemaInforme.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const auth = await autorizar(parsed.data.estudianteId);
  if (!auth.ok) return { ok: false, error: auth.error };

  return redactarInformeFamilia(
    { id: auth.user.id, rol: auth.user.rol, colegioId: auth.user.colegioId },
    parsed.data
  );
}
