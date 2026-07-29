"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { esFechaISOValida, fechaDesdeISO, isoDesdeFecha } from "@/lib/fecha";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";

const ROLES_REUNIONES = new Set(["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE"]);
const HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const asistenteSchema = z
  .object({
    apoderadoId: z.string().trim().min(1).max(40).optional(),
    nombre: z.string().trim().min(2, "Indica el nombre del asistente.").max(200),
    estudianteId: z.string().trim().min(1).max(40).optional(),
  })
  .refine((asistente) => !asistente.apoderadoId || Boolean(asistente.estudianteId), {
    message: "Un apoderado vinculado requiere estudiante.",
    path: ["estudianteId"],
  });

const crearSchema = z
  .object({
    cursoId: z.string().trim().min(1).max(40),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
    horaInicio: z.string().regex(HORA, "Hora de inicio inválida."),
    horaFin: z.string().regex(HORA, "Hora de término inválida."),
    tema: z.string().trim().min(3, "Indica el tema de la reunión.").max(300),
    objetivo: z.string().trim().max(2000).optional().default(""),
    asistentes: z.array(asistenteSchema).max(250).optional().default([]),
    acuerdos: z.string().trim().max(5000).optional().default(""),
    observaciones: z.string().trim().max(5000).optional().default(""),
  })
  .refine((datos) => datos.horaInicio < datos.horaFin, {
    message: "La hora de término debe ser posterior al inicio.",
    path: ["horaFin"],
  });

const listarSchema = z.object({
  cursoId: z.string().trim().min(1).max(40),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const archivarSchema = z.object({ reunionId: z.string().trim().min(1).max(40) });

type UsuarioSesion = { id: string; colegioId: string; rol: string };
type ErrorAccion = { ok: false; error: string };

async function autorizarCurso(
  user: UsuarioSesion,
  cursoId: string,
): Promise<{ ok: true; curso: { id: string; nivel: string; letra: string } } | ErrorAccion> {
  if (!ROLES_REUNIONES.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para gestionar reuniones de apoderados." };
  }

  const curso = await prisma.curso.findFirst({
    where: {
      id: cursoId,
      colegioId: user.colegioId,
      ...(user.rol === "PROFESOR_JEFE" ? { profesorJefeId: user.id } : {}),
    },
    select: { id: true, nivel: true, letra: true },
  });
  if (!curso) return { ok: false, error: "Curso no encontrado o fuera de tu alcance." };
  return { ok: true, curso };
}

/** Registra un acta completa y su lista de asistentes en una sola transacción. */
export async function crearReunionApoderados(input: unknown) {
  const { user } = await requerirSesion();
  if (!ROLES_REUNIONES.has(user.rol)) {
    return { ok: false as const, error: "No tienes permiso para gestionar reuniones de apoderados." };
  }

  const parsed = crearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!esFechaISOValida(parsed.data.fecha)) {
    return { ok: false as const, error: "Fecha inválida." };
  }

  const alcance = await autorizarCurso(user, parsed.data.cursoId);
  if (!alcance.ok) return alcance;

  const idsEstudiantes = [
    ...new Set(
      parsed.data.asistentes
        .map((asistente) => asistente.estudianteId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (idsEstudiantes.length) {
    const estudiantes = await prisma.estudiante.findMany({
      where: {
        id: { in: idsEstudiantes },
        colegioId: user.colegioId,
        matriculas: {
          some: { cursoId: parsed.data.cursoId, estado: "ACTIVA" },
        },
      },
      select: { id: true },
    });
    if (estudiantes.length !== idsEstudiantes.length) {
      return {
        ok: false as const,
        error: "Hay asistentes asociados a estudiantes que no pertenecen al curso.",
      };
    }
  }

  const idsApoderados = [
    ...new Set(
      parsed.data.asistentes
        .map((asistente) => asistente.apoderadoId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const vinculos = idsApoderados.length
    ? await prisma.apoderado.findMany({
        where: {
          id: { in: idsApoderados },
          estudiante: {
            colegioId: user.colegioId,
            matriculas: {
              some: { cursoId: parsed.data.cursoId, estado: "ACTIVA" },
            },
          },
        },
        select: {
          id: true,
          estudianteId: true,
          usuario: { select: { nombre: true } },
        },
      })
    : [];
  if (vinculos.length !== idsApoderados.length) {
    return {
      ok: false as const,
      error: "Hay apoderados que no pertenecen al curso o al colegio activo.",
    };
  }
  const vinculoPorId = new Map(vinculos.map((vinculo) => [vinculo.id, vinculo]));
  const asistentesNormalizados = parsed.data.asistentes.map((asistente) => {
    const vinculo = asistente.apoderadoId
      ? vinculoPorId.get(asistente.apoderadoId)
      : undefined;
    if (vinculo && vinculo.estudianteId !== asistente.estudianteId) {
      return null;
    }
    return {
      apoderadoId: vinculo?.id ?? null,
      nombre: vinculo?.usuario.nombre ?? asistente.nombre,
      estudianteId: asistente.estudianteId || null,
    };
  });
  if (asistentesNormalizados.some((asistente) => asistente === null)) {
    return {
      ok: false as const,
      error: "El apoderado seleccionado no corresponde al estudiante indicado.",
    };
  }

  const reunion = await prisma.$transaction(async (tx) => {
    const creada = await tx.reunionApoderados.create({
      data: {
        colegioId: user.colegioId,
        cursoId: parsed.data.cursoId,
        fecha: fechaDesdeISO(parsed.data.fecha),
        horaInicio: parsed.data.horaInicio,
        horaFin: parsed.data.horaFin,
        tema: parsed.data.tema,
        objetivo: parsed.data.objetivo || null,
        acuerdos: parsed.data.acuerdos || null,
        observaciones: parsed.data.observaciones || null,
        creadaPorId: user.id,
        actualizadaPorId: user.id,
        asistentes: {
          create: asistentesNormalizados.map((asistente) => ({
            colegioId: user.colegioId,
            apoderadoId: asistente!.apoderadoId,
            nombre: asistente!.nombre,
            estudianteId: asistente!.estudianteId,
          })),
        },
      },
      select: { id: true },
    });

    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "ReunionApoderados",
        entidadId: creada.id,
        // El acta y los nombres quedan en el agregado con control de acceso.
        // El log conserva solo metadatos no sensibles.
        despues: {
          cursoId: parsed.data.cursoId,
          fecha: parsed.data.fecha,
          horaInicio: parsed.data.horaInicio,
          horaFin: parsed.data.horaFin,
          cantidadAsistentes: parsed.data.asistentes.length,
          tieneAcuerdos: Boolean(parsed.data.acuerdos),
        },
      },
      tx,
    );
    return creada;
  });

  revalidatePath("/comunidad/reuniones-apoderados");
  return { ok: true as const, id: reunion.id };
}

/** Lista actas activas del curso; todo filtro comienza por el colegio activo. */
export async function listarReunionesApoderados(input: unknown) {
  const { user } = await requerirSesion();
  if (!ROLES_REUNIONES.has(user.rol)) {
    return { ok: false as const, error: "No tienes permiso para ver reuniones de apoderados." };
  }

  const parsed = listarSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Filtros inválidos." };
  if (
    (parsed.data.desde && !esFechaISOValida(parsed.data.desde)) ||
    (parsed.data.hasta && !esFechaISOValida(parsed.data.hasta)) ||
    (parsed.data.desde && parsed.data.hasta && parsed.data.desde > parsed.data.hasta)
  ) {
    return { ok: false as const, error: "Rango de fechas inválido." };
  }

  const alcance = await autorizarCurso(user, parsed.data.cursoId);
  if (!alcance.ok) return alcance;

  const reuniones = await prisma.reunionApoderados.findMany({
    where: {
      colegioId: user.colegioId,
      cursoId: parsed.data.cursoId,
      eliminadaEn: null,
      ...(parsed.data.desde || parsed.data.hasta
        ? {
            fecha: {
              ...(parsed.data.desde ? { gte: fechaDesdeISO(parsed.data.desde) } : {}),
              ...(parsed.data.hasta ? { lte: fechaDesdeISO(parsed.data.hasta) } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      fecha: true,
      horaInicio: true,
      horaFin: true,
      tema: true,
      objetivo: true,
      acuerdos: true,
      observaciones: true,
      creadaEn: true,
      actualizadaEn: true,
      asistentes: {
        where: { eliminadoEn: null },
        select: {
          id: true,
          nombre: true,
          estudianteId: true,
          apoderadoId: true,
          apoderado: { select: { calidad: true, parentesco: true } },
          estudiante: { select: { nombres: true, apellidos: true } },
        },
        orderBy: { nombre: "asc" },
      },
    },
    orderBy: [{ fecha: "desc" }, { horaInicio: "desc" }],
    take: 200,
  });

  return {
    ok: true as const,
    data: reuniones.map((reunion) => ({
      ...reunion,
      fecha: isoDesdeFecha(reunion.fecha),
      creadaEn: reunion.creadaEn.toISOString(),
      actualizadaEn: reunion.actualizadaEn.toISOString(),
    })),
  };
}

/** Archiva el acta y sus asistentes como un único agregado; nunca usa DELETE. */
export async function archivarReunionApoderados(input: unknown) {
  const { user } = await requerirSesion();
  if (!ROLES_REUNIONES.has(user.rol)) {
    return { ok: false as const, error: "No tienes permiso para archivar reuniones." };
  }

  const parsed = archivarSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Reunión inválida." };

  const reunion = await prisma.reunionApoderados.findFirst({
    where: {
      id: parsed.data.reunionId,
      colegioId: user.colegioId,
      eliminadaEn: null,
      ...(user.rol === "PROFESOR_JEFE" ? { curso: { profesorJefeId: user.id } } : {}),
    },
    select: {
      id: true,
      cursoId: true,
      fecha: true,
      _count: { select: { asistentes: { where: { eliminadoEn: null } } } },
    },
  });
  if (!reunion) return { ok: false as const, error: "Reunión no encontrada." };

  const eliminadaEn = new Date();
  await prisma.$transaction(async (tx) => {
    const resultado = await tx.reunionApoderados.updateMany({
      where: { id: reunion.id, colegioId: user.colegioId, eliminadaEn: null },
      data: {
        eliminadaEn,
        eliminadaPorId: user.id,
        actualizadaPorId: user.id,
      },
    });
    if (resultado.count !== 1) throw new Error("La reunión ya fue archivada.");

    await tx.asistenteReunionApoderados.updateMany({
      where: { colegioId: user.colegioId, reunionId: reunion.id, eliminadoEn: null },
      data: { eliminadoEn: eliminadaEn, eliminadoPorId: user.id },
    });

    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "ELIMINAR",
        entidad: "ReunionApoderados",
        entidadId: reunion.id,
        antes: {
          cursoId: reunion.cursoId,
          fecha: isoDesdeFecha(reunion.fecha),
          cantidadAsistentes: reunion._count.asistentes,
          activa: true,
        },
        despues: { activa: false },
      },
      tx,
    );
  });

  revalidatePath("/comunidad/reuniones-apoderados");
  return { ok: true as const };
}
