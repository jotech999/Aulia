"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { cifradoDisponible, cifrar } from "@/lib/cifrado";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";

const ROLES_PIE = new Set(["ADMIN", "DIRECTOR", "PIE"]);

const listarSchema = z.object({
  cursoId: z.string().trim().min(1).max(40).optional(),
  busqueda: z.string().trim().max(100).optional().default(""),
});

const guardarSchema = z.object({
  estudianteId: z.string().trim().min(1).max(40),
  diagnostico: z.string().trim().min(3, "Indica el diagnóstico.").max(5000),
  apoyos: z.string().trim().max(5000).optional().default(""),
  profesionalACargo: z.string().trim().max(200).optional().default(""),
});

const archivarSchema = z.object({ fichaId: z.string().trim().min(1).max(40) });

type ErrorAccion = { ok: false; error: string };

async function autorizarPie(): Promise<
  | { ok: true; user: { id: string; colegioId: string; rol: string } }
  | ErrorAccion
> {
  const { user } = await requerirSesion();
  if (!ROLES_PIE.has(user.rol)) {
    return { ok: false, error: "No tienes acceso a los registros PIE." };
  }
  return { ok: true, user };
}

/**
 * Listado mínimo para la bandeja PIE. Deliberadamente no selecciona diagnóstico,
 * apoyos, RUT ni datos de salud: la UI recibe solo identificación operacional.
 */
export async function listarRegistrosPie(input: unknown = {}) {
  const auth = await autorizarPie();
  if (!auth.ok) return auth;

  const parsed = listarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Filtros inválidos." };
  }

  const { cursoId, busqueda } = parsed.data;
  if (cursoId) {
    const curso = await prisma.curso.findFirst({
      where: { id: cursoId, colegioId: auth.user.colegioId },
      select: { id: true },
    });
    if (!curso) return { ok: false as const, error: "Curso no encontrado." };
  }

  const fichas = await prisma.fichaPie.findMany({
    where: {
      colegioId: auth.user.colegioId,
      eliminadaEn: null,
      estudiante: {
        ...(busqueda
          ? {
              OR: [
                { nombres: { contains: busqueda, mode: "insensitive" as const } },
                { apellidos: { contains: busqueda, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(cursoId
          ? { matriculas: { some: { cursoId, estado: "ACTIVA" as const } } }
          : {}),
      },
    },
    select: {
      id: true,
      estudianteId: true,
      profesionalACargo: true,
      actualizadaEn: true,
      estudiante: {
        select: {
          nombres: true,
          apellidos: true,
          matriculas: {
            where: { estado: "ACTIVA" },
            select: {
              curso: { select: { id: true, nivel: true, letra: true } },
            },
            take: 1,
          },
        },
      },
      _count: {
        select: { sesiones: { where: { eliminadaEn: null } } },
      },
    },
    orderBy: [{ actualizadaEn: "desc" }, { id: "desc" }],
    take: 500,
  });

  return {
    ok: true as const,
    data: fichas.map((ficha) => ({
      id: ficha.id,
      estudianteId: ficha.estudianteId,
      estudiante: `${ficha.estudiante.apellidos}, ${ficha.estudiante.nombres}`,
      curso: ficha.estudiante.matriculas[0]?.curso ?? null,
      profesionalACargo: ficha.profesionalACargo,
      sesionesRegistradas: ficha._count.sesiones,
      actualizadaEn: ficha.actualizadaEn.toISOString(),
    })),
  };
}

/**
 * Crea o actualiza la ficha como agregado auditable. El diagnóstico se cifra
 * antes de abrir la transacción y nunca forma parte de `audit_log`.
 */
export async function guardarRegistroPie(input: unknown) {
  const auth = await autorizarPie();
  if (!auth.ok) return auth;

  const parsed = guardarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!cifradoDisponible()) {
    return { ok: false as const, error: "El cifrado PIE no está configurado." };
  }

  const { estudianteId, diagnostico, apoyos, profesionalACargo } = parsed.data;
  const estudiante = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: auth.user.colegioId },
    select: { id: true },
  });
  if (!estudiante) return { ok: false as const, error: "Estudiante no encontrado." };

  const previa = await prisma.fichaPie.findFirst({
    where: { colegioId: auth.user.colegioId, estudianteId },
    select: { id: true, profesionalACargo: true, apoyos: true, eliminadaEn: true },
  });
  if (previa?.eliminadaEn) {
    return { ok: false as const, error: "La ficha PIE está archivada." };
  }

  const diagnosticoCifrado = cifrar(diagnostico);
  const ficha = await prisma.$transaction(async (tx) => {
    const guardada = await tx.fichaPie.upsert({
      where: { estudianteId },
      create: {
        colegioId: auth.user.colegioId,
        estudianteId,
        diagnosticoCifrado,
        apoyos: apoyos || null,
        profesionalACargo: profesionalACargo || null,
        creadaPorId: auth.user.id,
        actualizadaPorId: auth.user.id,
      },
      update: {
        diagnosticoCifrado,
        apoyos: apoyos || null,
        profesionalACargo: profesionalACargo || null,
        actualizadaPorId: auth.user.id,
      },
      select: { id: true },
    });

    await registrarAuditoria(
      {
        colegioId: auth.user.colegioId,
        usuarioId: auth.user.id,
        accion: previa ? "MODIFICAR" : "CREAR",
        entidad: "FichaPie",
        entidadId: guardada.id,
        antes: previa
          ? {
              profesionalACargo: previa.profesionalACargo,
              tieneApoyos: Boolean(previa.apoyos),
            }
          : undefined,
        despues: {
          estudianteId,
          profesionalACargo: profesionalACargo || null,
          tieneApoyos: Boolean(apoyos),
        },
      },
      tx,
    );
    return guardada;
  });

  revalidatePath("/pie");
  revalidatePath(`/pie/${estudianteId}`);
  return { ok: true as const, id: ficha.id };
}

/** Archiva la ficha; nunca elimina físicamente el registro ni sus sesiones. */
export async function archivarRegistroPie(input: unknown) {
  const auth = await autorizarPie();
  if (!auth.ok) return auth;

  const parsed = archivarSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ficha inválida." };

  const ficha = await prisma.fichaPie.findFirst({
    where: {
      id: parsed.data.fichaId,
      colegioId: auth.user.colegioId,
      eliminadaEn: null,
    },
    select: { id: true, estudianteId: true },
  });
  if (!ficha) return { ok: false as const, error: "Ficha PIE no encontrada." };

  await prisma.$transaction(async (tx) => {
    const resultado = await tx.fichaPie.updateMany({
      where: { id: ficha.id, colegioId: auth.user.colegioId, eliminadaEn: null },
      data: {
        eliminadaEn: new Date(),
        eliminadaPorId: auth.user.id,
        actualizadaPorId: auth.user.id,
      },
    });
    if (resultado.count !== 1) throw new Error("La ficha PIE ya fue archivada.");

    await registrarAuditoria(
      {
        colegioId: auth.user.colegioId,
        usuarioId: auth.user.id,
        accion: "ELIMINAR",
        entidad: "FichaPie",
        entidadId: ficha.id,
        antes: { estudianteId: ficha.estudianteId, activa: true },
        despues: { estudianteId: ficha.estudianteId, activa: false },
      },
      tx,
    );
  });

  revalidatePath("/pie");
  revalidatePath(`/pie/${ficha.estudianteId}`);
  return { ok: true as const };
}
