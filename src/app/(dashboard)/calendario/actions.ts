"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { esFechaISOValida, fechaDesdeISO } from "@/lib/fecha";
import { notificarApoderadosDeCurso, notificarApoderadosDeColegio } from "@/lib/notificaciones";
import { ESTILO_EVENTO, type TipoEventoVista } from "@/lib/calendario";

type Resultado = { ok: true } | { ok: false; error: string };

// Quién gestiona el calendario del colegio.
const ROLES_GESTION = ["ADMIN", "DIRECTOR", "UTP"];

const crearSchema = z.object({
  titulo: z.string().trim().min(1, "El título es obligatorio").max(120),
  fecha: z.string().refine(esFechaISOValida, "Fecha inválida"),
  tipo: z.enum(["GENERAL", "REUNION", "EVALUACION", "EFEMERIDE", "SUSPENSION"]),
  cursoId: z.string().optional().nullable(),
  descripcion: z.string().trim().max(500).optional().nullable(),
  avisarApoderados: z.boolean().optional().default(false),
});

/** Crea un evento del calendario escolar (dirección/UTP/admin), con auditoría. */
export async function crearEvento(input: unknown): Promise<Resultado> {
  const parsed = crearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { titulo, fecha, tipo, cursoId, descripcion, avisarApoderados } = parsed.data;

  const { user } = await requerirSesion();
  if (!ROLES_GESTION.includes(user.rol)) {
    return { ok: false, error: "No tienes permiso para crear eventos." };
  }

  // Si se asocia a un curso, debe ser del mismo colegio (multi-tenant).
  if (cursoId) {
    const curso = await prisma.curso.findFirst({
      where: { id: cursoId, colegioId: user.colegioId },
      select: { id: true },
    });
    if (!curso) return { ok: false, error: "Curso inválido." };
  }

  const evento = await prisma.$transaction(async (tx) => {
    const creado = await tx.eventoEscolar.create({
      data: {
        colegioId: user.colegioId,
        cursoId: cursoId || null,
        titulo,
        descripcion: descripcion || null,
        fecha: fechaDesdeISO(fecha),
        tipo,
        creadoPorId: user.id,
      },
      select: { id: true },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "EventoEscolar",
        entidadId: creado.id,
        despues: { titulo, fecha, tipo, cursoId: cursoId || null },
      },
      tx
    );
    return creado;
  });

  // Aviso opcional a apoderados (campana + push + email de respaldo). Best-effort,
  // fuera de la transacción para no bloquear la creación si el envío falla.
  if (avisarApoderados) {
    const aviso = {
      tipo: "GENERAL" as const,
      titulo: `📅 ${ESTILO_EVENTO[tipo as TipoEventoVista].etiqueta}: ${titulo}`,
      cuerpo: descripcion?.trim() || undefined,
      enlace: "/calendario",
    };
    if (cursoId) {
      await notificarApoderadosDeCurso(user.colegioId, cursoId, aviso);
    } else {
      await notificarApoderadosDeColegio(user.colegioId, aviso);
    }
  }

  revalidatePath("/calendario");
  return evento ? { ok: true } : { ok: false, error: "No se pudo crear el evento." };
}

/** Elimina (soft-delete) un evento del colegio. Nunca DELETE físico. */
export async function eliminarEvento(id: string): Promise<Resultado> {
  const { user } = await requerirSesion();
  if (!ROLES_GESTION.includes(user.rol)) {
    return { ok: false, error: "No tienes permiso para eliminar eventos." };
  }

  const evento = await prisma.eventoEscolar.findFirst({
    where: { id, colegioId: user.colegioId, eliminadaEn: null },
    select: { id: true, titulo: true },
  });
  if (!evento) return { ok: false, error: "Evento no encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.eventoEscolar.update({
      where: { id: evento.id },
      data: { eliminadaEn: new Date() },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "ELIMINAR",
        entidad: "EventoEscolar",
        entidadId: evento.id,
        antes: { titulo: evento.titulo },
      },
      tx
    );
  });

  revalidatePath("/calendario");
  return { ok: true };
}
