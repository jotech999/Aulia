"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { crearNotificaciones } from "@/lib/notificaciones";
import { fechaHoraSantiagoDesdeLocal } from "@/lib/fecha-hora-santiago";
import {
  puedeCrearComunicado,
  puedeAlcance,
  crearComunicadoSchema,
  type Alcance,
} from "@/lib/comunicados";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const ROLES_GESTION = new Set(["ADMIN", "DIRECTOR", "UTP"]);

/** Verifica que un curso del colegio sea accesible para el usuario (docencia). */
async function cursoAccesible(
  user: { id: string; rol: string; colegioId: string },
  cursoId: string
): Promise<boolean> {
  const curso = await prisma.curso.findFirst({
    where: { id: cursoId, colegioId: user.colegioId },
    select: {
      profesorJefeId: true,
      asignaturas: { select: { docenteId: true } },
    },
  });
  if (!curso) return false;
  if (ROLES_GESTION.has(user.rol)) return true;
  return (
    curso.profesorJefeId === user.id ||
    curso.asignaturas.some((a) => a.docenteId === user.id)
  );
}

/** Resuelve los estudianteIds objetivo del comunicado, validando pertenencia. */
async function resolverEstudiantes(
  user: { id: string; rol: string; colegioId: string },
  alcance: Alcance,
  objetivo: { nivel?: string | null; cursoId?: string | null; estudianteId?: string | null; estudianteIds?: string[] }
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const activa = { estado: "ACTIVA" as const, colegioId: user.colegioId };

  if (alcance === "COLEGIO") {
    const m = await prisma.matricula.findMany({ where: activa, select: { estudianteId: true } });
    return { ok: true, ids: m.map((x) => x.estudianteId) };
  }

  if (alcance === "NIVEL") {
    const m = await prisma.matricula.findMany({
      where: { ...activa, curso: { nivel: objetivo.nivel ?? "" } },
      select: { estudianteId: true },
    });
    return { ok: true, ids: m.map((x) => x.estudianteId) };
  }

  if (alcance === "CURSO") {
    if (!objetivo.cursoId || !(await cursoAccesible(user, objetivo.cursoId))) {
      return { ok: false, error: "No puedes enviar a ese curso." };
    }
    const m = await prisma.matricula.findMany({
      where: { ...activa, cursoId: objetivo.cursoId },
      select: { estudianteId: true },
    });
    return { ok: true, ids: m.map((x) => x.estudianteId) };
  }

  if (alcance === "SELECCION") {
    const idsSolicitados = [...new Set(objetivo.estudianteIds ?? [])];
    const matriculas = await prisma.matricula.findMany({
      where: { ...activa, estudianteId: { in: idsSolicitados } },
      select: { estudianteId: true, cursoId: true },
    });
    if (matriculas.length !== idsSolicitados.length) {
      return { ok: false, error: "La selección contiene estudiantes no disponibles." };
    }
    if (!ROLES_GESTION.has(user.rol)) {
      const cursos = [...new Set(matriculas.map((m) => m.cursoId))];
      const accesos = await Promise.all(cursos.map((id) => cursoAccesible(user, id)));
      if (accesos.some((ok) => !ok)) return { ok: false, error: "No puedes enviar a toda la selección." };
    }
    return { ok: true, ids: idsSolicitados };
  }

  // ESTUDIANTE
  if (!objetivo.estudianteId) return { ok: false, error: "Falta el estudiante." };
  const mat = await prisma.matricula.findFirst({
    where: { ...activa, estudianteId: objetivo.estudianteId },
    select: { cursoId: true },
  });
  if (!mat) return { ok: false, error: "Estudiante sin matrícula en el colegio." };
  if (!ROLES_GESTION.has(user.rol) && !(await cursoAccesible(user, mat.cursoId))) {
    return { ok: false, error: "No puedes enviar a ese estudiante." };
  }
  return { ok: true, ids: [objetivo.estudianteId] };
}

export async function crearComunicado(
  input: unknown
): Promise<Resultado<{ id: string; destinatarios: number; estado: "BORRADOR" | "PROGRAMADO" | "PUBLICADO" }>> {
  const parsed = crearComunicadoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { titulo, cuerpo, alcance, nivel, cursoId, estudianteId, estudianteIds, programadoPara, esPlantilla, nombrePlantilla } = parsed.data;

  const { user } = await requerirSesion();
  if (!puedeCrearComunicado(user.rol) || !puedeAlcance(user.rol, alcance)) {
    return { ok: false, error: "No tienes permiso para este envío." };
  }

  const objetivo = esPlantilla
    ? { ok: true as const, ids: [] }
    : await resolverEstudiantes(user, alcance, { nivel, cursoId, estudianteId, estudianteIds });
  if (!objetivo.ok) return objetivo;

  // Apoderados de los estudiantes objetivo, acotados al colegio (mitiga que
  // Apoderado no tenga colegioId propio: se deriva del estudiante).
  const apoderados = objetivo.ids.length
    ? await prisma.apoderado.findMany({
        where: {
          estudianteId: { in: objetivo.ids },
          estudiante: { colegioId: user.colegioId },
        },
        select: { usuarioId: true, estudianteId: true },
      })
    : [];

  const fechaProgramada = programadoPara ? fechaHoraSantiagoDesdeLocal(programadoPara) : null;
  if (programadoPara && !fechaProgramada) return { ok: false, error: "La fecha u hora programada no existe en el horario de Santiago." };
  const esProgramado = Boolean(fechaProgramada && fechaProgramada.getTime() > Date.now());
  const estado = esPlantilla ? "BORRADOR" : esProgramado ? "PROGRAMADO" : "PUBLICADO";

  const creado = await prisma.$transaction(async (tx) => {
    const com = await tx.comunicado.create({
      data: {
        colegioId: user.colegioId,
        autorId: user.id,
        titulo,
        cuerpo,
        alcance,
        nivel: alcance === "NIVEL" ? nivel ?? null : null,
        cursoId: alcance === "CURSO" ? cursoId ?? null : null,
        estudianteId: alcance === "ESTUDIANTE" ? estudianteId ?? null : null,
        estado,
        programadoPara: esProgramado ? fechaProgramada : null,
        publicadoEn: estado === "PUBLICADO" ? new Date() : null,
        esPlantilla,
        nombrePlantilla: esPlantilla ? nombrePlantilla : null,
        objetivos: objetivo.ids.length > 0
          ? { create: objetivo.ids.map((id) => ({ colegioId: user.colegioId, estudianteId: id })) }
          : undefined,
      },
      select: { id: true },
    });
    if (apoderados.length > 0) {
      await tx.comunicadoDestinatario.createMany({
        data: apoderados.map((a) => ({
          comunicadoId: com.id,
          colegioId: user.colegioId,
          apoderadoUsuarioId: a.usuarioId,
          estudianteId: a.estudianteId,
        })),
        skipDuplicates: true,
      });
    }
    if (estado === "PROGRAMADO" && fechaProgramada) {
      await tx.trabajoOutbox.create({
        data: {
          colegioId: user.colegioId,
          tipo: "PUBLICAR_COMUNICADO",
          claveIdempotencia: `comunicado:${com.id}`,
          agregadoId: com.id,
          disponibleEn: fechaProgramada,
          payloadMinimo: { comunicadoId: com.id },
        },
      });
    }
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "Comunicado",
        entidadId: com.id,
        // Metadatos, sin el cuerpo ni datos personales del menor.
        despues: { alcance, destinatarios: apoderados.length, estado, esPlantilla },
      },
      tx
    );
    if (estado === "PUBLICADO") {
      const usuariosUnicos = [...new Set(apoderados.map((apoderado) => apoderado.usuarioId))];
      await crearNotificaciones(
        usuariosUnicos.map((usuarioId) => ({
          colegioId: user.colegioId,
          usuarioId,
          tipo: "COMUNICADO" as const,
          titulo: `Nuevo comunicado: ${titulo}`,
          enlace: "/comunicacion",
        })),
        tx
      );
    }
    return com;
  });

  revalidatePath("/comunicacion");
  return { ok: true, id: creado.id, destinatarios: apoderados.length, estado };
}

export async function eliminarComunicado(id: string): Promise<Resultado> {
  const { user } = await requerirSesion();
  const com = await prisma.comunicado.findFirst({
    where: { id, colegioId: user.colegioId, eliminadoEn: null },
    select: { id: true, autorId: true },
  });
  if (!com) return { ok: false, error: "Comunicado no encontrado." };
  // El autor o la gestión pueden eliminar (soft-delete).
  if (com.autorId !== user.id && !ROLES_GESTION.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para eliminar este comunicado." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.comunicado.update({
      where: { id },
      data: { eliminadoEn: new Date(), eliminadoPorId: user.id },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "ELIMINAR",
        entidad: "Comunicado",
        entidadId: id,
      },
      tx
    );
  });

  revalidatePath("/comunicacion");
  return { ok: true };
}

/**
 * El apoderado confirma que leyó el comunicado (acto autenticado sobre el
 * contenido íntegro). Marca sus filas de destinatario. Valor probatorio.
 */
export async function marcarLeido(comunicadoId: string): Promise<Resultado> {
  const { user } = await requerirSesion();
  const res = await prisma.comunicadoDestinatario.updateMany({
    where: {
      comunicadoId,
      apoderadoUsuarioId: user.id,
      colegioId: user.colegioId,
      leidoEn: null,
    },
    data: { leidoEn: new Date() },
  });
  if (res.count === 0) {
    // Ya estaba leído o no es destinatario: no filtra información.
    return { ok: true };
  }
  revalidatePath("/comunicacion");
  return { ok: true };
}
