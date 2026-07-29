"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  puedeConvivencia,
  esEquipoConvivencia,
  crearCasoSchema,
  agregarSeguimientoSchema,
  cambiarEstadoSchema,
} from "@/lib/convivencia";
import { esFechaISOValida, fechaDesdeISO } from "@/lib/fecha";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * ¿Puede el usuario intervenir sobre casos de este estudiante? El equipo de
 * convivencia sobre todo el colegio; el profesor jefe solo sobre estudiantes con
 * matrícula activa en su jefatura. Verifica pertenencia al colegio (multi-tenant).
 */
async function puedeSobreEstudiante(
  user: { id: string; rol: string; colegioId: string },
  estudianteId: string
): Promise<boolean> {
  if (esEquipoConvivencia(user.rol)) {
    const est = await prisma.estudiante.findFirst({
      where: { id: estudianteId, colegioId: user.colegioId },
      select: { id: true },
    });
    return Boolean(est);
  }
  if (user.rol === "PROFESOR_JEFE") {
    const mat = await prisma.matricula.findFirst({
      where: {
        estudianteId,
        colegioId: user.colegioId,
        estado: "ACTIVA",
        curso: { profesorJefeId: user.id },
      },
      select: { id: true },
    });
    return Boolean(mat);
  }
  return false;
}

/** Carga un caso del colegio (no eliminado) y verifica acceso del usuario. */
async function cargarCasoAccesible(
  user: { id: string; rol: string; colegioId: string },
  casoId: string
) {
  const caso = await prisma.casoConvivencia.findFirst({
    where: { id: casoId, colegioId: user.colegioId, eliminadoEn: null },
    select: { id: true, estudianteId: true, estado: true },
  });
  if (!caso) return null;
  const ok = await puedeSobreEstudiante(user, caso.estudianteId);
  return ok ? caso : null;
}

export async function crearCaso(input: unknown): Promise<Resultado<{ id: string }>> {
  const parsed = crearCasoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { estudianteId, categoria, titulo, descripcion, responsableId } = parsed.data;
  const tituloFinal = titulo || categoria;

  const { user } = await requerirSesion();
  if (!puedeConvivencia(user.rol)) {
    return { ok: false, error: "No tienes acceso a convivencia." };
  }
  if (!(await puedeSobreEstudiante(user, estudianteId))) {
    return { ok: false, error: "No puedes abrir un caso para este estudiante." };
  }

  // El responsable, si se indica, debe ser miembro del colegio; por defecto el autor.
  let responsable = user.id;
  if (responsableId && responsableId !== user.id) {
    const membresia = await prisma.membresia.findFirst({
      where: { usuarioId: responsableId, colegioId: user.colegioId },
      select: { id: true },
    });
    if (membresia) responsable = responsableId;
  }

  const caso = await prisma.$transaction(async (tx) => {
    const c = await tx.casoConvivencia.create({
      data: {
        colegioId: user.colegioId,
        estudianteId,
        categoria,
        titulo: tituloFinal,
        descripcion,
        responsableId: responsable,
        abiertoPorId: user.id,
      },
      select: { id: true },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "CasoConvivencia",
        entidadId: c.id,
        // Metadatos, sin volcar el relato ni datos personales del menor.
        despues: { categoria, titulo: tituloFinal, estudianteId },
      },
      tx
    );
    return c;
  });

  revalidatePath("/convivencia");
  return { ok: true, id: caso.id };
}

export async function agregarSeguimiento(input: unknown): Promise<Resultado> {
  const parsed = agregarSeguimientoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { casoId, tipo, texto, fecha } = parsed.data;
  if (!esFechaISOValida(fecha)) return { ok: false, error: "Fecha inválida." };

  const { user } = await requerirSesion();
  if (!puedeConvivencia(user.rol)) {
    return { ok: false, error: "No tienes acceso a convivencia." };
  }
  const caso = await cargarCasoAccesible(user, casoId);
  if (!caso) return { ok: false, error: "Caso no encontrado." };

  await prisma.$transaction(async (tx) => {
    const seg = await tx.seguimientoConvivencia.create({
      data: {
        casoId,
        colegioId: user.colegioId,
        tipo,
        texto,
        fecha: fechaDesdeISO(fecha),
        autorId: user.id,
      },
      select: { id: true },
    });
    // El primer seguimiento mueve el caso a "en seguimiento".
    if (caso.estado === "ABIERTO") {
      await tx.casoConvivencia.update({
        where: { id: casoId },
        data: { estado: "EN_SEGUIMIENTO" },
      });
    }
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "SeguimientoConvivencia",
        entidadId: seg.id,
        despues: { casoId, tipo, fecha },
      },
      tx
    );
  });

  revalidatePath("/convivencia");
  revalidatePath(`/convivencia/${casoId}`);
  return { ok: true };
}

export async function cambiarEstadoCaso(input: unknown): Promise<Resultado> {
  const parsed = cambiarEstadoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { casoId, estado } = parsed.data;

  const { user } = await requerirSesion();
  if (!puedeConvivencia(user.rol)) {
    return { ok: false, error: "No tienes acceso a convivencia." };
  }
  const caso = await cargarCasoAccesible(user, casoId);
  if (!caso) return { ok: false, error: "Caso no encontrado." };
  if (caso.estado === estado) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.casoConvivencia.update({
      where: { id: casoId },
      data: { estado, cerradoEn: estado === "CERRADO" ? new Date() : null },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "MODIFICAR",
        entidad: "CasoConvivencia",
        entidadId: casoId,
        antes: { estado: caso.estado },
        despues: { estado },
      },
      tx
    );
  });

  revalidatePath("/convivencia");
  revalidatePath(`/convivencia/${casoId}`);
  return { ok: true };
}
