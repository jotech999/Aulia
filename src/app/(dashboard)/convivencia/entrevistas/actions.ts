"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { crearEntrevistaSchema, rolElegibleEntrevistas } from "@/lib/entrevistas";
import { esFechaISOValida, fechaDesdeISO } from "@/lib/fecha";
import { puedeVerEntrevistasDe } from "./consultas";

type Resultado = { ok: true; id: string } | { ok: false; error: string };

/**
 * Registra una entrevista/reunión con apoderado. Autorización doble en servidor:
 * rol elegible (nunca apoderado) + pertenencia al estudiante (docente del curso,
 * dirección o inspectoría). Dato sensible: auditado, referenciando al menor solo
 * por id y sin volcar el detalle completo al log.
 */
export async function crearEntrevista(input: unknown): Promise<Resultado> {
  const { user } = await requerirSesion();
  if (!rolElegibleEntrevistas(user.rol)) {
    return { ok: false, error: "No tienes permiso para registrar entrevistas." };
  }

  const parsed = crearEntrevistaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { estudianteId, apoderadoId, apoderado, calidadSnapshot, motivo, acuerdos, compromisos, fecha, proximaCita } =
    parsed.data;

  if (!esFechaISOValida(fecha)) return { ok: false, error: "Fecha inválida." };
  if (proximaCita && !esFechaISOValida(proximaCita)) {
    return { ok: false, error: "Fecha de próxima cita inválida." };
  }

  // Pertenencia: el estudiante debe estar dentro del alcance del usuario.
  if (!(await puedeVerEntrevistasDe(user, estudianteId))) {
    return { ok: false, error: "No puedes registrar entrevistas de este estudiante." };
  }

  let nombreApoderado = apoderado;
  let calidadConfirmada = calidadSnapshot || null;
  if (apoderadoId) {
    const vinculo = await prisma.apoderado.findFirst({
      where: {
        id: apoderadoId,
        estudianteId,
        estudiante: { colegioId: user.colegioId },
      },
      select: {
        parentesco: true,
        calidad: true,
        usuario: { select: { nombre: true } },
      },
    });
    if (!vinculo) {
      return { ok: false, error: "El apoderado seleccionado ya no está vinculado al estudiante." };
    }
    nombreApoderado = vinculo.usuario.nombre;
    const etiquetaCalidad =
      vinculo.calidad === "TITULAR"
        ? "Titular"
        : vinculo.calidad === "SUPLENTE"
          ? "Suplente"
          : "Por confirmar";
    calidadConfirmada = `${etiquetaCalidad} · ${vinculo.parentesco}`;
  }

  const creada = await prisma.$transaction(async (tx) => {
    const ent = await tx.entrevista.create({
      data: {
        colegioId: user.colegioId,
        estudianteId,
        apoderado: nombreApoderado,
        apoderadoId: apoderadoId || null,
        calidadSnapshot: calidadConfirmada,
        motivo,
        acuerdos: acuerdos || null,
        compromisos: compromisos || null,
        fecha: fechaDesdeISO(fecha),
        proximaCita: proximaCita ? fechaDesdeISO(proximaCita) : null,
        autorId: user.id,
      },
      select: { id: true },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "Entrevista",
        entidadId: ent.id,
        // Traza mínima sin nombres ni relato sensible. El detalle vive en el
        // registro con control de acceso y se verifica por hash si es necesario.
        despues: {
          estudianteId,
          apoderadoId: apoderadoId || null,
          apoderadoHash: createHash("sha256").update(nombreApoderado).digest("hex"),
          motivoHash: createHash("sha256").update(motivo).digest("hex"),
          tieneProximaCita: Boolean(proximaCita),
        },
      },
      tx
    );
    return ent;
  });

  revalidatePath(`/admin/estudiantes/${estudianteId}`);
  return { ok: true, id: creada.id };
}
