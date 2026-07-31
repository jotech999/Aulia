"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { cifrar, cifradoDisponible } from "@/lib/cifrado";

type Resultado = { ok: true } | { ok: false; error: string };

const contactoSchema = z.object({
  apoderadoId: z.string().trim().min(1),
  telefono: z.string().trim().max(40),
  direccion: z.string().trim().max(200),
});

/** Actualiza teléfono/dirección del usuario apoderado. Solo dirección/admin. */
export async function guardarContactoApoderado(input: unknown): Promise<Resultado> {
  const { user } = await requerirRol("ADMIN", "DIRECTOR");
  const parsed = contactoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { apoderadoId, telefono, direccion } = parsed.data;

  // Multi-tenant: el vínculo apoderado→estudiante debe ser de ESTE colegio.
  const vinculo = await prisma.apoderado.findFirst({
    where: { id: apoderadoId, estudiante: { colegioId: user.colegioId } },
    select: { usuarioId: true, estudianteId: true },
  });
  if (!vinculo) return { ok: false, error: "Apoderado no encontrado." };

  await prisma.usuario.update({
    where: { id: vinculo.usuarioId },
    data: { telefono: telefono || null, direccion: direccion || null },
  });
  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "MODIFICAR",
    entidad: "apoderado:contacto",
    entidadId: apoderadoId,
    despues: { estudianteId: vinculo.estudianteId },
  });
  return { ok: true };
}

const saludSchema = z.object({
  estudianteId: z.string().trim().min(1),
  texto: z.string().trim().max(4000),
});

/**
 * Guarda los antecedentes médicos CIFRADOS (AES-256-GCM, Ley 21.719).
 * Solo dirección/admin escriben; el texto nunca queda en claro en la BD
 * ni en el registro de auditoría.
 */
export async function guardarAntecedentesMedicos(input: unknown): Promise<Resultado> {
  const { user } = await requerirRol("ADMIN", "DIRECTOR");
  const parsed = saludSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { estudianteId, texto } = parsed.data;

  if (texto && !cifradoDisponible()) {
    return { ok: false, error: "El cifrado no está configurado en el servidor (PIE_ENCRYPTION_KEY)." };
  }

  const estudiante = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: user.colegioId },
    select: { id: true },
  });
  if (!estudiante) return { ok: false, error: "Estudiante no encontrado." };

  await prisma.estudiante.update({
    where: { id: estudianteId },
    data: { fichaSaludCifrada: texto ? cifrar(texto) : null },
  });
  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "MODIFICAR",
    entidad: "estudiante:fichaSalud",
    entidadId: estudianteId,
    despues: { actualizado: true }, // nunca el contenido (dato sensible)
  });
  return { ok: true };
}
