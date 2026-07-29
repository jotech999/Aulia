"use server";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { cifrarDetalleJustificacion } from "@/lib/cifrado-justificacion";
import {
  autorizarRegistroClase,
  autorizarRectificacion,
  guardarClaseSchema,
  rectificarClaseSchema,
} from "@/lib/firma";
import { esFechaFutura, fechaDesdeISO, hoyEnSantiago } from "@/lib/fecha";
import { esFeriado } from "@/lib/feriados";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

class ErrorRegistroClase extends Error {}

const guardarClaseConOrigenSchema = guardarClaseSchema.extend({
  planificacionOrigenId: z.string().trim().min(1).optional(),
});

function hashCanonico(valor: unknown) {
  return createHash("sha256").update(JSON.stringify(valor)).digest("hex");
}

function diaSemanaISO(iso: string) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dia === 0 ? 7 : dia;
}

async function transaccionSerializable<T>(
  operacion: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      return await prisma.$transaction(operacion, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const reintentable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!reintentable || intento === 1) throw error;
    }
  }
  throw new Error("Transacción sin resultado.");
}

/**
 * Carga la asignatura con lo necesario para autorizar y la ubica en el colegio
 * de la sesión (multi-tenant). Devuelve el docente y el profesor jefe del curso.
 */
async function cargarAsignatura(asignaturaId: string, colegioId: string) {
  return prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId },
    select: {
      id: true,
      docenteId: true,
      curso: { select: { id: true, profesorJefeId: true, anioEscolar: { select: { anio: true } } } },
    },
  });
}

/**
 * Registra o edita el contenido de una clase (aún no firmada). Idempotente por
 * (asignatura, fecha, bloque): si ya existe se actualiza. Una clase ya firmada
 * no se edita por aquí — se rectifica con `rectificarClase`.
 */
export async function guardarClase(input: unknown): Promise<Resultado<{ id: string }>> {
  const parsed = guardarClaseConOrigenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const {
    asignaturaId,
    bloqueHorarioId,
    fecha,
    contenido,
    oaIds,
    planificacionOrigenId,
  } = parsed.data;

  const { user } = await requerirSesion();
  const asignatura = await cargarAsignatura(asignaturaId, user.colegioId);
  if (!asignatura) return { ok: false, error: "Asignatura no encontrada." };

  if (
    !autorizarRegistroClase(user.rol, user.id, {
      docenteId: asignatura.docenteId,
      profesorJefeId: asignatura.curso.profesorJefeId,
    })
  ) {
    return { ok: false, error: "No tienes permiso para registrar esta clase." };
  }

  const fechaDate = fechaDesdeISO(fecha);
  if (esFechaFutura(fecha, hoyEnSantiago())) {
    return { ok: false, error: "No se puede registrar ni firmar una clase futura." };
  }
  if (fechaDate.getUTCFullYear() !== asignatura.curso.anioEscolar.anio) {
    return { ok: false, error: "La fecha no pertenece al año escolar de la asignatura." };
  }
  if (esFeriado(fecha)) {
    return { ok: false, error: "No se puede registrar una clase en un feriado legal." };
  }
  if (!bloqueHorarioId) {
    return { ok: false, error: "Selecciona un bloque de un horario publicado para registrar la clase." };
  }

  let guardada: { id: string };
  try {
    guardada = await transaccionSerializable(async (tx) => {
      // Validar el bloque dentro de la misma transacción serializable que crea
      // la clase evita vincularla a un bloque retirado concurrentemente.
      const [bloque, suspension, planificacionOrigen] = await Promise.all([
        tx.bloqueHorario.findFirst({
          where: {
            id: bloqueHorarioId,
            colegioId: user.colegioId,
            asignaturaId,
            eliminadaEn: null,
            dia: diaSemanaISO(fecha),
            horarioVersion: {
              estado: "PUBLICADO",
              vigenteDesde: { lte: fechaDate },
              OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaDate } }],
            },
          },
          select: { id: true },
        }),
        tx.eventoEscolar.findFirst({
          where: {
            colegioId: user.colegioId,
            fecha: fechaDate,
            tipo: "SUSPENSION",
            eliminadaEn: null,
            OR: [{ cursoId: null }, { cursoId: asignatura.curso.id }],
          },
          select: { id: true },
        }),
        planificacionOrigenId
          ? tx.planificacion.findFirst({
              where: {
                id: planificacionOrigenId,
                colegioId: user.colegioId,
                asignaturaId,
                tipo: "CLASE",
                esPlantilla: false,
                eliminadaEn: null,
              },
              select: {
                id: true,
                version: true,
                titulo: true,
                descripcion: true,
                fechaInicio: true,
                fechaFin: true,
                padreId: true,
                oas: { select: { oaCodigo: true }, orderBy: { oaCodigo: "asc" } },
              },
            })
          : Promise.resolve(null),
      ]);
      if (!bloque || suspension) throw new ErrorRegistroClase("El bloque no corresponde a una jornada lectiva activa.");
      if (planificacionOrigenId && !planificacionOrigen) {
        throw new ErrorRegistroClase(
          "La clase planificada no existe o no pertenece a esta asignatura."
        );
      }

      const procedencia = planificacionOrigen
        ? {
            planificacionOrigenId: planificacionOrigen.id,
            planificacionOrigenVersion: planificacionOrigen.version,
            planificacionSnapshotHash: hashCanonico({
              id: planificacionOrigen.id,
              version: planificacionOrigen.version,
              titulo: planificacionOrigen.titulo,
              descripcion: planificacionOrigen.descripcion,
              fechaInicio: planificacionOrigen.fechaInicio?.toISOString().slice(0, 10) ?? null,
              fechaFin: planificacionOrigen.fechaFin?.toISOString().slice(0, 10) ?? null,
              padreId: planificacionOrigen.padreId,
              oaCodigos: planificacionOrigen.oas.map((oa) => oa.oaCodigo),
            }),
            planificacionCopiadaPorId: user.id,
            planificacionCopiadaEn: new Date(),
          }
        : null;

      // Dedupe manual: el @@unique con bloqueHorarioId NULL no colisiona en Postgres.
      const existente = await tx.claseRegistrada.findFirst({
        where: {
          asignaturaId,
          colegioId: user.colegioId,
          fecha: fechaDate,
          bloqueHorarioId,
          eliminadaEn: null,
        },
        select: {
          id: true,
          contenido: true,
          oaIds: true,
          firmadaEn: true,
          fecha: true,
          planificacionOrigenId: true,
          planificacionOrigenVersion: true,
          planificacionSnapshotHash: true,
        },
      });

      if (existente?.firmadaEn) {
        throw new ErrorRegistroClase(
          "La clase ya está firmada. Usa rectificar para corregirla."
        );
      }

      if (!existente) {
        const clase = await tx.claseRegistrada.create({
          data: {
            colegioId: user.colegioId,
            asignaturaId,
            bloqueHorarioId,
            fecha: fechaDate,
            contenido,
            oaIds,
            ...(procedencia ?? {}),
          },
          select: { id: true },
        });
        await registrarAuditoria(
          {
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "CREAR",
            entidad: "ClaseRegistrada",
            entidadId: clase.id,
            despues: {
              fecha,
              bloqueHorarioId,
              oaIds,
              contenidoHash: hashCanonico(contenido),
              snapshotCifrado: cifrarDetalleJustificacion(
                JSON.stringify({ contenido, oaIds })
              ),
              oaCantidad: oaIds.length,
              planificacionOrigenId: procedencia?.planificacionOrigenId ?? null,
              planificacionOrigenVersion:
                procedencia?.planificacionOrigenVersion ?? null,
              planificacionSnapshotHash:
                procedencia?.planificacionSnapshotHash ?? null,
            },
          },
          tx
        );
        return clase;
      }

      await tx.claseRegistrada.update({
        where: { id: existente.id },
        data: { contenido, oaIds, ...(procedencia ?? {}) },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "ClaseRegistrada",
          entidadId: existente.id,
          antes: {
            oaIds: existente.oaIds,
            contenidoHash: hashCanonico(existente.contenido),
            snapshotCifrado: cifrarDetalleJustificacion(
              JSON.stringify({ contenido: existente.contenido, oaIds: existente.oaIds })
            ),
            oaCantidad: existente.oaIds.length,
            planificacionOrigenId: existente.planificacionOrigenId,
            planificacionOrigenVersion: existente.planificacionOrigenVersion,
            planificacionSnapshotHash: existente.planificacionSnapshotHash,
          },
          despues: {
            fecha,
            bloqueHorarioId,
            oaIds,
            contenidoHash: hashCanonico(contenido),
            snapshotCifrado: cifrarDetalleJustificacion(
              JSON.stringify({ contenido, oaIds })
            ),
            oaCantidad: oaIds.length,
            planificacionOrigenId:
              procedencia?.planificacionOrigenId ?? existente.planificacionOrigenId,
            planificacionOrigenVersion:
              procedencia?.planificacionOrigenVersion ??
              existente.planificacionOrigenVersion,
            planificacionSnapshotHash:
              procedencia?.planificacionSnapshotHash ??
              existente.planificacionSnapshotHash,
          },
        },
        tx
      );
      return { id: existente.id };
    });
  } catch (e) {
    if (e instanceof ErrorRegistroClase) {
      return { ok: false, error: e.message };
    }
    // Colisión del @@unique por doble envío concurrente del mismo bloque.
    if (
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "P2002"
    ) {
      return { ok: false, error: "Ya existe un registro para esa fecha y bloque." };
    }
    return { ok: false, error: "No se pudo guardar la clase. Reintenta." };
  }

  revalidatePath("/libro-clases/firma");
  return { ok: true, id: guardada.id };
}

/**
 * Firma una clase: escribe firmadaPorId + firmadaEn (inmutables) y certifica el
 * acto con una entrada FIRMAR en audit_log. No se puede firmar dos veces.
 */
export async function firmarClase(
  asignaturaId: string,
  claseId: string
): Promise<Resultado> {
  const { user } = await requerirSesion();
  const asignatura = await cargarAsignatura(asignaturaId, user.colegioId);
  if (!asignatura) return { ok: false, error: "Asignatura no encontrada." };

  if (
    !autorizarRegistroClase(user.rol, user.id, {
      docenteId: asignatura.docenteId,
      profesorJefeId: asignatura.curso.profesorJefeId,
    })
  ) {
    return { ok: false, error: "No tienes permiso para firmar esta clase." };
  }

  try {
    await transaccionSerializable(async (tx) => {
      const clase = await tx.claseRegistrada.findFirst({
        where: { id: claseId, asignaturaId, colegioId: user.colegioId, eliminadaEn: null },
        select: {
          id: true,
          fecha: true,
          contenido: true,
          oaIds: true,
          firmadaEn: true,
          bloqueHorarioId: true,
          planificacionOrigenId: true,
          planificacionOrigenVersion: true,
          planificacionSnapshotHash: true,
          bloqueHorario: {
            select: {
              colegioId: true,
              eliminadaEn: true,
              dia: true,
              horarioVersion: { select: { estado: true, vigenteDesde: true, vigenteHasta: true } },
            },
          },
        },
      });
      if (!clase) throw new ErrorRegistroClase("Clase no encontrada.");
      if (clase.firmadaEn) throw new ErrorRegistroClase("La clase ya está firmada.");
      if (clase.fecha > fechaDesdeISO(hoyEnSantiago())) {
        throw new ErrorRegistroClase("No se puede firmar una clase futura.");
      }
      if (esFeriado(clase.fecha.toISOString().slice(0, 10))) {
        throw new ErrorRegistroClase("No se puede firmar una clase en un feriado legal.");
      }
      const bloque = clase.bloqueHorario;
      if (
        clase.fecha.getUTCFullYear() !== asignatura.curso.anioEscolar.anio ||
        !clase.bloqueHorarioId ||
        !bloque ||
        bloque.colegioId !== user.colegioId ||
        bloque.eliminadaEn ||
        bloque.dia !== diaSemanaISO(clase.fecha.toISOString().slice(0, 10)) ||
        bloque.horarioVersion?.estado !== "PUBLICADO" ||
        bloque.horarioVersion.vigenteDesde > clase.fecha ||
        (bloque.horarioVersion.vigenteHasta && bloque.horarioVersion.vigenteHasta < clase.fecha)
      ) {
        throw new ErrorRegistroClase("La clase no pertenece a un bloque horario vigente para esa fecha.");
      }
      const suspension = await tx.eventoEscolar.findFirst({
        where: {
          colegioId: user.colegioId,
          fecha: clase.fecha,
          tipo: "SUSPENSION",
          eliminadaEn: null,
          OR: [{ cursoId: null }, { cursoId: asignatura.curso.id }],
        },
        select: { id: true },
      });
      if (suspension) throw new ErrorRegistroClase("No se puede firmar una clase en una jornada suspendida.");
      const firmadaEn = new Date();
      const cambio = await tx.claseRegistrada.updateMany({
        where: { id: clase.id, colegioId: user.colegioId, firmadaEn: null, eliminadaEn: null },
        data: { firmadaPorId: user.id, firmadaEn },
      });
      if (cambio.count !== 1) throw new ErrorRegistroClase("La clase fue firmada por otra persona. Actualiza la página.");
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "FIRMAR",
          entidad: "ClaseRegistrada",
          entidadId: clase.id,
          despues: {
            fecha: clase.fecha.toISOString().slice(0, 10),
            bloqueHorarioId: clase.bloqueHorarioId,
            oaIds: clase.oaIds,
            contenidoHash: hashCanonico(clase.contenido),
            snapshotCifrado: cifrarDetalleJustificacion(
              JSON.stringify({ contenido: clase.contenido, oaIds: clase.oaIds })
            ),
            oaCantidad: clase.oaIds.length,
            firmadaEn: firmadaEn.toISOString(),
            planificacionOrigenId: clase.planificacionOrigenId,
            planificacionOrigenVersion: clase.planificacionOrigenVersion,
            planificacionSnapshotHash: clase.planificacionSnapshotHash,
          },
        },
        tx
      );
    });
  } catch (error) {
    if (error instanceof ErrorRegistroClase) return { ok: false, error: error.message };
    return { ok: false, error: "No se pudo firmar la clase. Actualiza e inténtalo nuevamente." };
  }

  revalidatePath("/libro-clases/firma");
  return { ok: true };
}

/**
 * Rectifica una clase YA FIRMADA: solo rol elevado o quien firmó, con motivo
 * obligatorio. La firma original se conserva; el cambio queda en audit_log
 * (MODIFICAR con antes/después y motivo). Nunca se sobrescribe sin dejar rastro.
 */
export async function rectificarClase(input: unknown): Promise<Resultado> {
  const parsed = rectificarClaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos o falta el motivo." };
  const { claseId, asignaturaId, contenido, oaIds, motivo } = parsed.data;

  const { user } = await requerirSesion();
  const asignatura = await cargarAsignatura(asignaturaId, user.colegioId);
  if (!asignatura) return { ok: false, error: "Asignatura no encontrada." };

  try {
    await prisma.$transaction(async (tx) => {
      const clase = await tx.claseRegistrada.findFirst({
        where: { id: claseId, asignaturaId, colegioId: user.colegioId, eliminadaEn: null },
        select: { id: true, contenido: true, oaIds: true, firmadaPorId: true, firmadaEn: true, actualizadaEn: true },
      });
      if (!clase) throw new ErrorRegistroClase("Clase no encontrada.");
      if (!clase.firmadaEn) throw new ErrorRegistroClase("La clase no está firmada; edítala normalmente.");
      if (!autorizarRectificacion(user.rol, user.id, { firmadaPorId: clase.firmadaPorId })) {
        throw new ErrorRegistroClase("No tienes permiso para rectificar esta clase firmada.");
      }
      const cambio = await tx.claseRegistrada.updateMany({
        where: { id: clase.id, colegioId: user.colegioId, firmadaEn: { not: null }, actualizadaEn: clase.actualizadaEn, eliminadaEn: null },
        data: { contenido, oaIds },
      });
      if (cambio.count !== 1) throw new ErrorRegistroClase("La clase cambió mientras la revisabas. Actualiza antes de rectificar.");
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "ClaseRegistrada",
          entidadId: clase.id,
          antes: {
            oaIds: clase.oaIds,
            contenidoHash: hashCanonico(clase.contenido),
            snapshotCifrado: cifrarDetalleJustificacion(
              JSON.stringify({ contenido: clase.contenido, oaIds: clase.oaIds })
            ),
            oaCantidad: clase.oaIds.length,
          },
          despues: {
            oaIds,
            contenidoHash: hashCanonico(contenido),
            snapshotCifrado: cifrarDetalleJustificacion(
              JSON.stringify({ contenido, oaIds })
            ),
            oaCantidad: oaIds.length,
            motivoHash: hashCanonico(motivo),
            motivoCifrado: cifrarDetalleJustificacion(motivo),
            rectificacion: true,
          },
        },
        tx
      );
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ErrorRegistroClase) return { ok: false, error: error.message };
    return { ok: false, error: "No se pudo rectificar la clase. Actualiza e inténtalo nuevamente." };
  }

  revalidatePath("/libro-clases/firma");
  return { ok: true };
}
