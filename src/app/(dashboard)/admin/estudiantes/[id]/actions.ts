"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  autorizarCrearAnotacion,
  autorizarEliminarAnotacion,
  crearAnotacionSchema,
  eliminarAnotacionSchema,
  pareceDatoSensible,
} from "@/lib/anotaciones";
import { fechaDesdeISO } from "@/lib/fecha";
import { notificarApoderadosDeEstudiante } from "@/lib/notificaciones";
import { z } from "zod";
import { whereEstudiantesVisibles } from "@/lib/alcance-estudiantes";
import { enviarEmail } from "@/lib/email";

type ResultadoCrear =
  | { ok: true }
  | { ok: false; error: string; advertencia?: boolean };

/**
 * Crea una anotación en la hoja de vida del estudiante. Solo staff del colegio
 * (nunca apoderado). El estudiante debe pertenecer al colegio de la sesión.
 * Bloquea texto que parece incluir salud: esos datos solo pertenecen a la ficha
 * cifrada. El audit_log conserva metadatos y hash, nunca duplica el texto libre.
 */
export async function crearAnotacion(
  input: unknown,
  _confirmacionClienteIgnorada = false
): Promise<ResultadoCrear> {
  const parsed = crearAnotacionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { estudianteId, tipo, categoria, texto, fechaHecho } = parsed.data;

  const { user } = await requerirSesion();
  if (!autorizarCrearAnotacion(user.rol)) {
    return { ok: false, error: "No tienes permiso para crear anotaciones." };
  }

  // Multi-tenant: el estudiante debe ser del colegio de la sesión.
  const estudiante = await prisma.estudiante.findFirst({
    where: { id: estudianteId, ...whereEstudiantesVisibles(user) },
    select: { id: true, nombres: true },
  });
  if (!estudiante) return { ok: false, error: "Estudiante no encontrado." };

  if (pareceDatoSensible(texto)) {
    return {
      ok: false,
      error:
        "El texto parece incluir datos de salud. Por protección del estudiante no puede guardarse en la hoja de vida; regístralo únicamente en la ficha de salud cifrada.",
    };
  }

  await prisma.$transaction(async (tx) => {
    const anotacion = await tx.anotacion.create({
      data: {
        colegioId: user.colegioId,
        estudianteId,
        tipo,
        categoria: categoria || null,
        texto,
        fechaHecho: fechaHecho ? fechaDesdeISO(fechaHecho) : null,
        autorId: user.id,
      },
      select: { id: true },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "Anotacion",
        entidadId: anotacion.id,
        despues: {
          tipo,
          categoria: categoria || null,
          fechaHecho,
          contenidoHash: createHash("sha256").update(texto).digest("hex"),
        },
      },
      tx
    );
  });

  // Aviso a los apoderados: informativo (debido proceso). Sin el texto ni datos
  // sensibles; solo el tipo y el nombre del pupilo.
  const tipoLegible =
    tipo === "POSITIVA" ? "positiva" : tipo === "NEGATIVA" ? "negativa" : "de registro";
  await notificarApoderadosDeEstudiante(user.colegioId, estudianteId, {
    tipo: "GENERAL",
    titulo: `Nueva anotación ${tipoLegible}`,
    cuerpo: `Se registró una anotación de ${estudiante.nombres.split(" ")[0]} en la hoja de vida.`,
    enlace: `/mi-pupilo/${estudianteId}`,
  });

  revalidatePath(`/admin/estudiantes/${estudianteId}`);
  return { ok: true };
}

/**
 * Elimina (soft-delete) una anotación: solo el autor o dirección/UTP/admin, con
 * motivo. Nunca DELETE físico (Circular 30, retención ≥5 años). Auditado.
 */
export async function eliminarAnotacion(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = eliminarAnotacionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Falta el motivo." };
  const { anotacionId, motivo } = parsed.data;

  const { user } = await requerirSesion();

  const anotacion = await prisma.anotacion.findFirst({
    where: { id: anotacionId, colegioId: user.colegioId, eliminadaEn: null, estudiante: whereEstudiantesVisibles(user) },
    select: { id: true, estudianteId: true, autorId: true, tipo: true, texto: true },
  });
  if (!anotacion) return { ok: false, error: "Anotación no encontrada." };

  if (!autorizarEliminarAnotacion(user.rol, user.id, { autorId: anotacion.autorId })) {
    return { ok: false, error: "No tienes permiso para eliminar esta anotación." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.anotacion.update({
      where: { id: anotacion.id },
      data: { eliminadaEn: new Date(), eliminadaPorId: user.id },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "ELIMINAR",
        entidad: "Anotacion",
        entidadId: anotacion.id,
        antes: {
          tipo: anotacion.tipo,
          contenidoHash: createHash("sha256").update(anotacion.texto).digest("hex"),
        },
        despues: { motivo },
      },
      tx
    );
  });

  revalidatePath(`/admin/estudiantes/${anotacion.estudianteId}`);
  return { ok: true };
}

const portalSchema = z.object({ estudianteId: z.string().min(1), email: z.string().trim().email().max(254) });

export async function vincularPortalEstudiante(input: unknown) {
  const parsed = portalSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ingresa el correo de una cuenta existente." };
  const { user } = await requerirSesion();
  if (!["ADMIN", "DIRECTOR"].includes(user.rol)) return { ok: false as const, error: "No tienes permiso para habilitar portales." };
  const [estudiante, cuenta, accesoExistente] = await Promise.all([
    prisma.estudiante.findFirst({ where: { id: parsed.data.estudianteId, colegioId: user.colegioId, matriculas: { some: { colegioId: user.colegioId, estado: "ACTIVA" } } }, select: { id: true } }),
    prisma.usuario.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { id: true, email: true } }),
    prisma.accesoEstudiante.findUnique({ where: { colegioId_estudianteId: { colegioId: user.colegioId, estudianteId: parsed.data.estudianteId } }, select: { id: true, usuarioId: true } }),
  ]);
  if (!estudiante) return { ok: false as const, error: "El estudiante no tiene matrícula activa en este colegio." };
  if (!cuenta) return { ok: false as const, error: "No existe una cuenta con ese correo. Créala mediante el proceso seguro de usuarios antes de vincularla." };
  if (accesoExistente && accesoExistente.usuarioId !== cuenta.id) return { ok: false as const, error: "El estudiante ya está vinculado a otra cuenta." };
  const otro = await prisma.accesoEstudiante.findUnique({ where: { colegioId_usuarioId: { colegioId: user.colegioId, usuarioId: cuenta.id } }, select: { estudianteId: true } });
  if (otro && otro.estudianteId !== estudiante.id) return { ok: false as const, error: "La cuenta ya está vinculada a otro estudiante." };
  if (accesoExistente?.usuarioId === cuenta.id) {
    const activo = await prisma.accesoEstudiante.findUnique({ where: { colegioId_estudianteId: { colegioId: user.colegioId, estudianteId: estudiante.id } }, select: { activo: true } });
    if (activo?.activo) return { ok: false as const, error: "El portal ya está activo para esa cuenta." };
  }
  try {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const invitacion = await prisma.$transaction(async (tx) => {
      const membresia = await tx.membresia.upsert({ where: { usuarioId_colegioId_rol: { usuarioId: cuenta.id, colegioId: user.colegioId, rol: "ESTUDIANTE" } }, create: { usuarioId: cuenta.id, colegioId: user.colegioId, rol: "ESTUDIANTE", activa: false }, update: { activa: false, revocadaEn: null } });
      const acceso = await tx.accesoEstudiante.upsert({ where: { colegioId_estudianteId: { colegioId: user.colegioId, estudianteId: estudiante.id } }, create: { colegioId: user.colegioId, usuarioId: cuenta.id, estudianteId: estudiante.id, creadoPorId: user.id, activo: false }, update: { usuarioId: cuenta.id, activo: false, revocadoEn: null, creadoPorId: user.id } });
      await tx.trabajoOutbox.updateMany({ where: { colegioId: user.colegioId, tipo: "INVITACION_PORTAL_ESTUDIANTE", agregadoId: acceso.id, estado: "PENDIENTE" }, data: { estado: "FALLIDO", procesadoEn: new Date(), errorCodigo: "INVITACION_REEMPLAZADA" } });
      const trabajo = await tx.trabajoOutbox.create({ data: { colegioId: user.colegioId, tipo: "INVITACION_PORTAL_ESTUDIANTE", claveIdempotencia: `portal:${acceso.id}:${randomUUID()}`, agregadoId: acceso.id, disponibleEn: expiraEn, payloadMinimo: { tokenHash, usuarioId: cuenta.id, membresiaId: membresia.id, expiraEn: expiraEn.toISOString() } }, select: { id: true } });
      await registrarAuditoria({ colegioId: user.colegioId, usuarioId: user.id, accion: accesoExistente ? "MODIFICAR" : "CREAR", entidad: "InvitacionPortalEstudiante", entidadId: trabajo.id, despues: { accesoId: acceso.id, estudianteId: estudiante.id, expiraEn: expiraEn.toISOString(), activo: false } }, tx);
      return trabajo;
    });
    const origen = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const enlace = `${origen}/activar-portal/${invitacion.id}.${token}`;
    const enviado = await enviarEmail({
      to: cuenta.email,
      subject: "Invitación protegida al portal estudiantil",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Activa tu portal estudiantil</h2><p>Tu colegio te invitó a consultar tu información escolar.</p><p><a href="${enlace}" style="display:inline-block;padding:12px 18px;background:#7442d2;color:#fff;text-decoration:none;border-radius:8px">Revisar y activar acceso</a></p><p>El enlace vence en 24 horas y solo puede usarse una vez.</p></div>`,
    });
    if (!enviado) {
      await prisma.trabajoOutbox.updateMany({ where: { id: invitacion.id, colegioId: user.colegioId, estado: "PENDIENTE" }, data: { estado: "FALLIDO", procesadoEn: new Date(), errorCodigo: "EMAIL_NO_ENVIADO" } });
      return { ok: false as const, error: "No se pudo enviar la invitación. Verifica la configuración de correo e inténtalo nuevamente." };
    }
    revalidatePath(`/admin/estudiantes/${estudiante.id}`);
    return { ok: true as const, mensaje: "Invitación enviada. El acceso seguirá inactivo hasta que la persona confirme el enlace." };
  } catch { return { ok: false as const, error: "No se pudo vincular el portal." }; }
}

export async function revocarPortalEstudiante(estudianteId: string) {
  const parsed = z.string().min(1).safeParse(estudianteId);
  if (!parsed.success) return { ok: false as const, error: "Estudiante inválido." };
  const { user } = await requerirSesion();
  if (!["ADMIN", "DIRECTOR"].includes(user.rol)) return { ok: false as const, error: "No tienes permiso para revocar portales." };
  try {
    await prisma.$transaction(async (tx) => {
      const acceso = await tx.accesoEstudiante.findFirst({ where: { colegioId: user.colegioId, estudianteId: parsed.data, activo: true }, select: { id: true, usuarioId: true } });
      if (!acceso) throw new Error("ACCESO_NO_ENCONTRADO");
      const ahora = new Date();
      const cambio = await tx.accesoEstudiante.updateMany({ where: { id: acceso.id, colegioId: user.colegioId, activo: true }, data: { activo: false, revocadoEn: ahora } });
      if (cambio.count !== 1) throw new Error("CONFLICTO_ACCESO");
      await tx.membresia.updateMany({ where: { usuarioId: acceso.usuarioId, colegioId: user.colegioId, rol: "ESTUDIANTE", activa: true }, data: { activa: false, revocadaEn: ahora } });
      await tx.trabajoOutbox.updateMany({ where: { colegioId: user.colegioId, tipo: "INVITACION_PORTAL_ESTUDIANTE", agregadoId: acceso.id, estado: "PENDIENTE" }, data: { estado: "FALLIDO", procesadoEn: ahora, errorCodigo: "ACCESO_REVOCADO" } });
      await registrarAuditoria({ colegioId: user.colegioId, usuarioId: user.id, accion: "MODIFICAR", entidad: "AccesoEstudiante", entidadId: acceso.id, antes: { activo: true }, despues: { activo: false, revocadoEn: ahora.toISOString() } }, tx);
    });
    revalidatePath(`/admin/estudiantes/${parsed.data}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "El acceso ya no está activo o cambió mientras lo revisabas." };
  }
}
