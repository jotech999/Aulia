"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  puedePie,
  guardarFichaPieSchema,
  agregarSesionPieSchema,
} from "@/lib/pie";
import { cifradoDisponible, cifrar } from "@/lib/cifrado";
import { esFechaISOValida, fechaDesdeISO } from "@/lib/fecha";

type Resultado = { ok: true } | { ok: false; error: string };

/** Verifica sesión + rol PIE + que el estudiante sea del colegio. */
async function autorizarPie(estudianteId: string) {
  const { user } = await requerirSesion();
  if (!puedePie(user.rol)) {
    return { ok: false as const, error: "No tienes acceso a los registros PIE." };
  }
  const est = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: user.colegioId },
    select: { id: true },
  });
  if (!est) return { ok: false as const, error: "Estudiante no encontrado." };
  return { ok: true as const, user };
}

/**
 * Crea o actualiza la ficha PIE de un estudiante. El diagnóstico se CIFRA en
 * reposo (AES-256-GCM). La auditoría NO guarda el diagnóstico, solo metadatos.
 */
export async function guardarFichaPie(input: unknown): Promise<Resultado> {
  const parsed = guardarFichaPieSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { estudianteId, diagnostico, apoyos, profesionalACargo } = parsed.data;

  const auth = await autorizarPie(estudianteId);
  if (!auth.ok) return auth;
  const { user } = auth;

  if (!cifradoDisponible()) {
    return { ok: false, error: "El cifrado PIE no está configurado. Contacta a soporte." };
  }
  const diagnosticoCifrado = cifrar(diagnostico);

  const previa = await prisma.fichaPie.findUnique({
    where: { estudianteId },
    select: { id: true, eliminadaEn: true },
  });
  if (previa?.eliminadaEn) {
    return { ok: false, error: "La ficha PIE está archivada." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.fichaPie.upsert({
      where: { estudianteId },
      create: {
        colegioId: user.colegioId,
        estudianteId,
        diagnosticoCifrado,
        apoyos: apoyos || null,
        profesionalACargo: profesionalACargo || null,
        creadaPorId: user.id,
        actualizadaPorId: user.id,
      },
      update: {
        diagnosticoCifrado,
        apoyos: apoyos || null,
        profesionalACargo: profesionalACargo || null,
        actualizadaPorId: user.id,
      },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: previa ? "MODIFICAR" : "CREAR",
        entidad: "FichaPie",
        entidadId: estudianteId,
        // NUNCA el diagnóstico; solo metadatos.
        despues: { profesionalACargo: profesionalACargo || null, tieneApoyos: Boolean(apoyos) },
      },
      tx
    );
  });

  revalidatePath(`/pie/${estudianteId}`);
  return { ok: true };
}

/** Registra una sesión de apoyo PIE. Requiere ficha existente. Auditado. */
export async function agregarSesionPie(input: unknown): Promise<Resultado> {
  const parsed = agregarSesionPieSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { estudianteId, fecha, asistio, observacion } = parsed.data;
  if (!esFechaISOValida(fecha)) return { ok: false, error: "Fecha inválida." };

  const auth = await autorizarPie(estudianteId);
  if (!auth.ok) return auth;
  const { user } = auth;

  const ficha = await prisma.fichaPie.findFirst({
    where: { estudianteId, colegioId: user.colegioId, eliminadaEn: null },
    select: { id: true },
  });
  if (!ficha) return { ok: false, error: "Primero crea la ficha PIE del estudiante." };

  await prisma.$transaction(async (tx) => {
    const s = await tx.sesionPie.create({
      data: {
        colegioId: user.colegioId,
        fichaPieId: ficha.id,
        fecha: fechaDesdeISO(fecha),
        asistio,
        observacion: observacion || null,
        autorId: user.id,
      },
      select: { id: true },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "SesionPie",
        entidadId: s.id,
        despues: { estudianteId, fecha, asistio },
      },
      tx
    );
  });

  revalidatePath(`/pie/${estudianteId}`);
  return { ok: true };
}
