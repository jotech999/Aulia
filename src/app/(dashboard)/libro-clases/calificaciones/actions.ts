"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  notificarApoderadosDeCurso,
  notificarCalificacionApoderados,
} from "@/lib/notificaciones";
import {
  autorizarRegistroNotas,
  esNivelPrebasica,
  esNotaValida,
  guardarCalificacionSchema,
  guardarEvaluacionSchema,
} from "@/lib/calificaciones";
import { esFechaISOValida, fechaDesdeISO, isoDesdeFecha, formatearFechaLarga } from "@/lib/fecha";
import { periodosDeRegimen } from "./consultas";
import { nombreCurso } from "@/lib/cursos";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Carga la asignatura de la sesión y autoriza al usuario para calificarla.
 * Centraliza las verificaciones multi-tenant, de rol/pertenencia y de nivel
 * (prebásica usa evaluación conceptual, no esta libreta numérica).
 */
async function asignaturaAutorizada(
  asignaturaId: string
): Promise<
  | {
      ok: true;
      user: Awaited<ReturnType<typeof requerirSesion>>["user"];
      regimen: string;
    }
  | { ok: false; error: string }
> {
  const { user } = await requerirSesion();
  const asignatura = await prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId: user.colegioId },
    select: {
      docenteId: true,
      curso: {
        select: {
          nivel: true,
          anioEscolar: { select: { regimen: true } },
        },
      },
    },
  });
  if (!asignatura) return { ok: false, error: "Asignatura no encontrada." };
  if (esNivelPrebasica(asignatura.curso.nivel)) {
    return {
      ok: false,
      error: "Prebásica se evalúa por conceptos, no con notas 1.0–7.0.",
    };
  }
  if (!autorizarRegistroNotas(user.rol, user.id, asignatura)) {
    return {
      ok: false,
      error: "No tienes permiso para calificar esta asignatura.",
    };
  }
  return { ok: true, user, regimen: asignatura.curso.anioEscolar.regimen };
}

// ── Evaluaciones (columnas de la grilla) ────────────────────────────────

export async function crearEvaluacion(input: unknown): Promise<Resultado<{ id: string }>> {
  const parsed = guardarEvaluacionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { asignaturaId, nombre, tipo, ponderacion, periodo, fecha, contenidos } = parsed.data;

  if (!esFechaISOValida(fecha)) return { ok: false, error: "Fecha inválida." };

  const auth = await asignaturaAutorizada(asignaturaId);
  if (!auth.ok) return auth;
  const { user } = auth;

  // El periodo debe existir en el régimen del colegio (un SEMESTRAL no tiene periodo 3).
  if (!periodosDeRegimen(auth.regimen).includes(periodo)) {
    return { ok: false, error: "Periodo inválido para el régimen del colegio." };
  }

  // Datos para notificar a los apoderados del curso (nombre + curso de la asignatura).
  const asig = await prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId: user.colegioId },
    select: { nombre: true, cursoId: true, curso: { select: { nivel: true, letra: true } } },
  });

  const creada = await prisma.$transaction(async (tx) => {
    const ev = await tx.evaluacion.create({
      data: {
        colegioId: user.colegioId,
        asignaturaId,
        nombre,
        tipo,
        ponderacion,
        periodo,
        fecha: fechaDesdeISO(fecha),
        contenidos: contenidos || null,
      },
      select: { id: true },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "Evaluacion",
        entidadId: ev.id,
        despues: { nombre, tipo, ponderacion, periodo, fecha },
      },
      tx
    );
    return ev;
  });

  // Aviso automático a los apoderados: resuelve que no dependan de un aviso manual.
  // Incluye la fecha (lo que más quieren saber) y enlaza al calendario.
  if (asig) {
    await notificarApoderadosDeCurso(user.colegioId, asig.cursoId, {
      tipo: "EVALUACION",
      titulo: `Nueva evaluación: ${nombre}`,
      // El aviso lo lee un apoderado: el curso va como "5° básico A", no "5B A".
      cuerpo: `${asig.nombre} · ${nombreCurso(asig.curso)} · ${formatearFechaLarga(fecha)}`,
      enlace: "/calendario",
    });
  }

  revalidatePath("/libro-clases/calificaciones");
  return { ok: true, id: creada.id };
}

export async function editarEvaluacion(input: unknown): Promise<Resultado> {
  const parsed = guardarEvaluacionSchema
    .extend({ evaluacionId: guardarEvaluacionSchema.shape.asignaturaId })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { evaluacionId, asignaturaId, nombre, tipo, ponderacion, periodo, fecha } =
    parsed.data;
  if (!esFechaISOValida(fecha)) return { ok: false, error: "Fecha inválida." };

  const auth = await asignaturaAutorizada(asignaturaId);
  if (!auth.ok) return auth;
  const { user } = auth;

  if (!periodosDeRegimen(auth.regimen).includes(periodo)) {
    return { ok: false, error: "Periodo inválido para el régimen del colegio." };
  }

  // La evaluación debe pertenecer a la asignatura y al colegio, y no estar eliminada.
  const previa = await prisma.evaluacion.findFirst({
    where: {
      id: evaluacionId,
      asignaturaId,
      colegioId: user.colegioId,
      eliminadaEn: null,
    },
    select: { nombre: true, tipo: true, ponderacion: true, periodo: true, fecha: true },
  });
  if (!previa) return { ok: false, error: "Evaluación no encontrada." };

  await prisma.$transaction(async (tx) => {
    await tx.evaluacion.update({
      where: { id: evaluacionId },
      data: { nombre, tipo, ponderacion, periodo, fecha: fechaDesdeISO(fecha) },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "MODIFICAR",
        entidad: "Evaluacion",
        entidadId: evaluacionId,
        // El cambio de ponderación recalcula todos los promedios: crítico de trazar.
        antes: {
          nombre: previa.nombre,
          tipo: previa.tipo,
          ponderacion: previa.ponderacion,
          periodo: previa.periodo,
          fecha: isoDesdeFecha(previa.fecha),
        },
        despues: { nombre, tipo, ponderacion, periodo, fecha },
      },
      tx
    );
  });

  revalidatePath("/libro-clases/calificaciones");
  return { ok: true };
}

export async function eliminarEvaluacion(
  asignaturaId: string,
  evaluacionId: string
): Promise<Resultado> {
  const auth = await asignaturaAutorizada(asignaturaId);
  if (!auth.ok) return auth;
  const { user } = auth;

  const previa = await prisma.evaluacion.findFirst({
    where: {
      id: evaluacionId,
      asignaturaId,
      colegioId: user.colegioId,
      eliminadaEn: null,
    },
    select: { nombre: true, ponderacion: true },
  });
  if (!previa) return { ok: false, error: "Evaluación no encontrada." };

  await prisma.$transaction(async (tx) => {
    const ahora = new Date();
    // Soft-delete (Circular 30): nunca DELETE físico.
    await tx.evaluacion.update({
      where: { id: evaluacionId },
      data: { eliminadaEn: ahora, eliminadaPorId: user.id },
    });
    // Propaga el soft-delete a sus calificaciones para consistencia histórica:
    // quedan fuera de la grilla y de cualquier promedio (que filtra eliminadaEn: null).
    await tx.calificacion.updateMany({
      where: { evaluacionId, eliminadaEn: null },
      data: { eliminadaEn: ahora, eliminadaPorId: user.id },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "ELIMINAR",
        entidad: "Evaluacion",
        entidadId: evaluacionId,
        antes: { nombre: previa.nombre, ponderacion: previa.ponderacion },
      },
      tx
    );
  });

  revalidatePath("/libro-clases/calificaciones");
  return { ok: true };
}

// ── Calificaciones (celdas de la grilla) ────────────────────────────────

/**
 * Guarda (crea/corrige) una calificación. `nota` numérica = calificada;
 * `nota: null` = pendiente (limpia la nota); `eximida: true` = eximido.
 * Cada cambio queda en audit_log con antes/después SIN datos personales del menor.
 */
export async function guardarCalificacion(input: unknown): Promise<Resultado> {
  const parsed = guardarCalificacionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nota inválida." };
  const { evaluacionId, estudianteId, nota, eximida } = parsed.data;

  // Invariante: un eximido no lleva nota (coincide con el CHECK de la BD).
  const notaFinal = eximida ? null : nota;

  const { user } = await requerirSesion();

  // La evaluación (y su asignatura) deben ser del colegio y no estar eliminadas.
  const evaluacion = await prisma.evaluacion.findFirst({
    where: { id: evaluacionId, colegioId: user.colegioId, eliminadaEn: null },
    select: {
      asignaturaId: true,
      nombre: true,
      asignatura: {
        select: {
          nombre: true,
          docenteId: true,
          cursoId: true,
          curso: { select: { nivel: true } },
        },
      },
    },
  });
  if (!evaluacion) return { ok: false, error: "Evaluación no encontrada." };

  if (esNivelPrebasica(evaluacion.asignatura.curso.nivel)) {
    return { ok: false, error: "Prebásica no usa la libreta numérica." };
  }
  if (!autorizarRegistroNotas(user.rol, user.id, evaluacion.asignatura)) {
    return { ok: false, error: "No tienes permiso para calificar esta asignatura." };
  }

  // El estudiante debe ser del colegio Y tener matrícula ACTIVA en el curso de la
  // asignatura: descarta ids ajenos o de otro colegio aunque vengan en la solicitud.
  const matricula = await prisma.matricula.findFirst({
    where: {
      estudianteId,
      cursoId: evaluacion.asignatura.cursoId,
      colegioId: user.colegioId,
      estado: "ACTIVA",
    },
    select: { id: true, estudiante: { select: { nombres: true } } },
  });
  if (!matricula) {
    return { ok: false, error: "El estudiante no pertenece a este curso." };
  }

  const previa = await prisma.calificacion.findUnique({
    where: { evaluacionId_estudianteId: { evaluacionId, estudianteId } },
    select: { id: true, nota: true, eximida: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      if (!previa) {
        const guardada = await tx.calificacion.create({
          data: {
            colegioId: user.colegioId,
            evaluacionId,
            estudianteId,
            nota: notaFinal,
            eximida,
            registradoPorId: user.id,
          },
          select: { id: true },
        });
        await registrarAuditoria(
          {
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "CREAR",
            entidad: "Calificacion",
            entidadId: guardada.id,
            despues: { nota: notaFinal, eximida },
          },
          tx
        );
      } else if (previa.nota !== notaFinal || previa.eximida !== eximida) {
        await tx.calificacion.update({
          where: { id: previa.id },
          data: {
            nota: notaFinal,
            eximida,
            registradoPorId: user.id,
            // Al recalificar se reactiva una fila soft-eliminada, si la hubiera.
            eliminadaEn: null,
            eliminadaPorId: null,
          },
        });
        await registrarAuditoria(
          {
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "MODIFICAR",
            entidad: "Calificacion",
            entidadId: previa.id,
            antes: { nota: previa.nota, eximida: previa.eximida },
            despues: { nota: notaFinal, eximida },
          },
          tx
        );
      }
      // Si no cambió nada, no se escribe: evita ruido en audit_log.
    });
  } catch {
    return { ok: false, error: "No se pudo guardar la nota. Reintenta." };
  }

  // Aviso automático a apoderados al PUBLICAR una nueva calificación (primera vez
  // que el estudiante recibe nota/eximición en esta evaluación). No dispara en
  // ediciones ni al dejar la celda vacía. Respeta el flag del colegio.
  if (!previa && (notaFinal !== null || eximida)) {
    const resumen = await notificarCalificacionApoderados(user.colegioId, estudianteId, {
      asignatura: evaluacion.asignatura.nombre,
      evaluacion: evaluacion.nombre,
      pupilo: matricula.estudiante.nombres.split(" ")[0],
      colegioNombre: user.colegioNombre,
    });
    if (resumen.inApp > 0) {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "NOTIFICAR_APODERADO",
        entidad: "Calificacion",
        entidadId: evaluacionId,
        // Traza sin PII: canales y cantidad.
        despues: { evento: "calificacion_publicada", apoderados: resumen.inApp, emails: resumen.emails },
      }).catch(() => {});
    }
  }

  revalidatePath("/libro-clases/calificaciones");
  return { ok: true };
}

// ── Guardado por lote (pegado desde Excel / deshacer de un pegado) ──────────

const loteSchema = z.object({
  asignaturaId: z.string().min(1),
  celdas: z
    .array(
      z.object({
        evaluacionId: z.string().min(1),
        estudianteId: z.string().min(1),
        nota: z.number().nullable(),
        eximida: z.boolean(),
      })
    )
    .min(1)
    // Tope realista (≈ curso grande × varias evaluaciones); acota la transacción.
    .max(400),
});

/**
 * Guarda muchas calificaciones de una misma asignatura en una sola transacción
 * (pegado desde Excel). Autoriza una vez la asignatura y valida en bloque que
 * cada evaluación y estudiante pertenezcan a ella y al colegio (multi-tenant).
 * Audita CADA cambio (Circular 30) y notifica solo las primeras publicaciones.
 */
export async function guardarCalificacionesLote(
  input: unknown
): Promise<Resultado<{ guardados: number; invalidos: number }>> {
  const parsed = loteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const { asignaturaId, celdas } = parsed.data;

  const auth = await asignaturaAutorizada(asignaturaId);
  if (!auth.ok) return auth;
  const { user } = auth;

  const asig = await prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId: user.colegioId },
    select: { nombre: true, cursoId: true },
  });
  if (!asig) return { ok: false, error: "Asignatura no encontrada." };

  const evIds = [...new Set(celdas.map((c) => c.evaluacionId))];
  const estIds = [...new Set(celdas.map((c) => c.estudianteId))];

  // Evaluaciones válidas de ESTA asignatura (no eliminadas) y estudiantes con
  // matrícula ACTIVA en su curso: descarta cualquier id ajeno o de otro colegio.
  const [evaluaciones, matriculas, previas] = await Promise.all([
    prisma.evaluacion.findMany({
      where: { id: { in: evIds }, asignaturaId, colegioId: user.colegioId, eliminadaEn: null },
      select: { id: true, nombre: true },
    }),
    prisma.matricula.findMany({
      where: { estudianteId: { in: estIds }, cursoId: asig.cursoId, colegioId: user.colegioId, estado: "ACTIVA" },
      select: { estudianteId: true, estudiante: { select: { nombres: true } } },
    }),
    prisma.calificacion.findMany({
      where: { evaluacionId: { in: evIds }, estudianteId: { in: estIds }, colegioId: user.colegioId },
      select: { id: true, evaluacionId: true, estudianteId: true, nota: true, eximida: true },
    }),
  ]);
  const evOk = new Map(evaluaciones.map((e) => [e.id, e.nombre]));
  const estOk = new Map(matriculas.map((m) => [m.estudianteId, m.estudiante.nombres]));
  const previaDe = new Map(previas.map((p) => [`${p.evaluacionId}|${p.estudianteId}`, p]));

  const validas = celdas.filter(
    (c) =>
      evOk.has(c.evaluacionId) &&
      estOk.has(c.estudianteId) &&
      (c.eximida || c.nota === null || esNotaValida(c.nota))
  );
  const invalidos = celdas.length - validas.length;
  if (validas.length === 0) return { ok: false, error: "Ninguna celda válida para guardar." };

  const nuevasPublicaciones: { estudianteId: string; evaluacionId: string }[] = [];
  let guardados = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const c of validas) {
        const notaFinal = c.eximida ? null : c.nota;
        const previa = previaDe.get(`${c.evaluacionId}|${c.estudianteId}`);
        if (!previa) {
          const g = await tx.calificacion.create({
            data: {
              colegioId: user.colegioId,
              evaluacionId: c.evaluacionId,
              estudianteId: c.estudianteId,
              nota: notaFinal,
              eximida: c.eximida,
              registradoPorId: user.id,
            },
            select: { id: true },
          });
          await registrarAuditoria(
            { colegioId: user.colegioId, usuarioId: user.id, accion: "CREAR", entidad: "Calificacion", entidadId: g.id, despues: { nota: notaFinal, eximida: c.eximida } },
            tx
          );
          guardados++;
          if (notaFinal !== null || c.eximida) nuevasPublicaciones.push({ estudianteId: c.estudianteId, evaluacionId: c.evaluacionId });
        } else if (previa.nota !== notaFinal || previa.eximida !== c.eximida) {
          await tx.calificacion.update({
            where: { id: previa.id },
            data: { nota: notaFinal, eximida: c.eximida, registradoPorId: user.id, eliminadaEn: null, eliminadaPorId: null },
          });
          await registrarAuditoria(
            { colegioId: user.colegioId, usuarioId: user.id, accion: "MODIFICAR", entidad: "Calificacion", entidadId: previa.id, antes: { nota: previa.nota, eximida: previa.eximida }, despues: { nota: notaFinal, eximida: c.eximida } },
            tx
          );
          guardados++;
        }
      }
    },
    // Un pegado grande puede tener cientos de escrituras seriales; damos margen
    // explícito para que no aborte por el timeout por defecto (5 s) de Prisma.
    { timeout: 20000, maxWait: 8000 });
  } catch {
    return { ok: false, error: "No se pudieron guardar las notas. Reintenta." };
  }

  // Aviso a apoderados solo de las PRIMERAS publicaciones (igual criterio que el
  // guardado por celda). Best-effort en paralelo; no bloquea el resultado.
  const avisos = await Promise.allSettled(
    nuevasPublicaciones.map((np) =>
      notificarCalificacionApoderados(user.colegioId, np.estudianteId, {
        asignatura: asig.nombre,
        evaluacion: evOk.get(np.evaluacionId) ?? "",
        pupilo: (estOk.get(np.estudianteId) ?? "").split(" ")[0],
        colegioNombre: user.colegioNombre,
      })
    )
  );
  // Traza de la notificación (Circular 30), agregada y sin PII, como en el single.
  const apoderados = avisos.reduce((s, r) => s + (r.status === "fulfilled" ? r.value.inApp : 0), 0);
  const emails = avisos.reduce((s, r) => s + (r.status === "fulfilled" ? r.value.emails : 0), 0);
  if (apoderados > 0) {
    await registrarAuditoria({
      colegioId: user.colegioId,
      usuarioId: user.id,
      accion: "NOTIFICAR_APODERADO",
      entidad: "Calificacion",
      entidadId: asignaturaId,
      despues: { evento: "calificaciones_publicadas_lote", publicaciones: nuevasPublicaciones.length, apoderados, emails },
    }).catch(() => {});
  }

  revalidatePath("/libro-clases/calificaciones");
  return { ok: true, guardados, invalidos };
}
