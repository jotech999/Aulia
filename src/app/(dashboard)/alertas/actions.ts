"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { fechaDesdeISO } from "@/lib/fecha";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const GESTION = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

/** Autoriza a intervenir sobre un estudiante: gestión/dupla o su profesor jefe. */
async function autorizarSobreEstudiante(user: { id: string; rol: string; colegioId: string }, estudianteId: string) {
  const est = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: user.colegioId }, // multi-tenant
    select: { matriculas: { where: { estado: "ACTIVA" }, take: 1, select: { curso: { select: { profesorJefeId: true } } } } },
  });
  if (!est) return false;
  if (GESTION.has(user.rol)) return true;
  return est.matriculas[0]?.curso.profesorJefeId === user.id;
}

const intervencionSchema = z.object({
  estudianteId: z.string().min(1),
  accion: z.string().trim().min(3, "Describe la acción").max(500),
  responsable: z.string().trim().min(2, "Indica al responsable").max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proximoControl: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notas: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function registrarIntervencion(input: unknown): Promise<Resultado> {
  const parsed = intervencionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  const { user } = await requerirSesion();
  if (!(await autorizarSobreEstudiante(user, d.estudianteId)))
    return { ok: false, error: "No tienes permiso sobre este estudiante." };

  await prisma.$transaction(async (tx) => {
    const iv = await tx.intervencion.create({
      data: {
        colegioId: user.colegioId,
        estudianteId: d.estudianteId,
        accion: d.accion,
        responsable: d.responsable,
        fecha: fechaDesdeISO(d.fecha),
        proximoControl: d.proximoControl ? fechaDesdeISO(d.proximoControl) : null,
        notas: d.notas || null,
        autorId: user.id,
      },
      select: { id: true },
    });
    await registrarAuditoria(
      { colegioId: user.colegioId, usuarioId: user.id, accion: "CREAR", entidad: "Intervencion", entidadId: iv.id, despues: { estudianteId: d.estudianteId, responsable: d.responsable } },
      tx
    );
  });
  revalidatePath("/alertas");
  return { ok: true };
}

export async function cerrarIntervencion(id: string): Promise<Resultado> {
  const { user } = await requerirSesion();
  const iv = await prisma.intervencion.findFirst({ where: { id, colegioId: user.colegioId, eliminadaEn: null }, select: { id: true, estudianteId: true, estado: true } });
  if (!iv) return { ok: false, error: "Intervención no encontrada." };
  if (!(await autorizarSobreEstudiante(user, iv.estudianteId))) return { ok: false, error: "Sin permiso." };
  if (iv.estado === "CERRADA") return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.intervencion.update({ where: { id }, data: { estado: "CERRADA" } });
    await registrarAuditoria(
      { colegioId: user.colegioId, usuarioId: user.id, accion: "MODIFICAR", entidad: "Intervencion", entidadId: id, despues: { estado: "CERRADA" } },
      tx
    );
  });
  revalidatePath("/alertas");
  return { ok: true };
}
