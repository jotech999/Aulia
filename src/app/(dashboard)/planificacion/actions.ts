"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  autorizarPlanificacion,
  asignaturaCanonica,
  guardarPlanificacionSchema,
} from "@/lib/planificacion";
import { esFechaISOValida, fechaDesdeISO, isoDesdeFecha, hoyEnSantiago } from "@/lib/fecha";
import { generarClasesPlanificacion } from "@/lib/ia/docente";
import { generarCronograma } from "./calendario-planificacion";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

class ErrorPlanificacionConcurrente extends Error {}

/**
 * Carga la asignatura de la sesión, autoriza al usuario y valida/filtra los
 * códigos OA contra el catálogo y el nivel del curso. Centraliza las reglas
 * multi-tenant y de currículum comunes a crear/editar.
 */
async function prepararEntrada(input: unknown) {
  const parsed = guardarPlanificacionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Datos inválidos." };
  const data = parsed.data;

  for (const f of [data.fechaInicio, data.fechaFin]) {
    if (f && !esFechaISOValida(f)) {
      return { ok: false as const, error: "Fecha inválida." };
    }
  }

  const { user } = await requerirSesion();
  const asignatura = await prisma.asignatura.findFirst({
    where: { id: data.asignaturaId, colegioId: user.colegioId },
    select: { docenteId: true, nombre: true, curso: { select: { nivel: true } } },
  });
  if (!asignatura) return { ok: false as const, error: "Asignatura no encontrada." };

  if (!autorizarPlanificacion(user.rol, user.id, asignatura)) {
    return { ok: false as const, error: "No tienes permiso para planificar esta asignatura." };
  }

  // Solo se aceptan OA del catálogo que correspondan al nivel y asignatura del
  // curso: descarta códigos ajenos o de otro nivel (integridad de cobertura).
  let oaCodigos: string[] = [];
  if (data.oaCodigos.length > 0) {
    const canonica = asignaturaCanonica(asignatura.nombre);
    if (canonica) {
      const validos = await prisma.oa.findMany({
        where: {
          nivel: asignatura.curso.nivel,
          asignatura: canonica,
          codigo: { in: data.oaCodigos },
        },
        select: { codigo: true },
      });
      oaCodigos = validos.map((o) => o.codigo);
    }
  }

  return { ok: true as const, user, data, oaCodigos };
}

export async function crearPlanificacion(input: unknown): Promise<Resultado<{ id: string }>> {
  const prep = await prepararEntrada(input);
  if (!prep.ok) return prep;
  const { user, data, oaCodigos } = prep;

  // El padre, si se indica, debe ser una planificación viva de la misma asignatura.
  if (data.padreId) {
    const padre = await prisma.planificacion.findFirst({
      where: {
        id: data.padreId,
        asignaturaId: data.asignaturaId,
        colegioId: user.colegioId,
        eliminadaEn: null,
      },
      select: { id: true },
    });
    if (!padre) return { ok: false, error: "Planificación superior inválida." };
  }

  // Para una CLASE dentro de una unidad: número correlativo (orden) y estado
  // pedagógico por defecto (la evidencia legal sigue siendo la clase firmada).
  const esClase = data.tipo === "CLASE";
  const ordenClase =
    esClase && data.padreId
      ? ((
          await prisma.planificacion.aggregate({
            where: {
              colegioId: user.colegioId,
              padreId: data.padreId,
              tipo: "CLASE",
              eliminadaEn: null,
            },
            _max: { ordenClase: true },
          })
        )._max.ordenClase ?? 0) + 1
      : null;

  const creada = await prisma.$transaction(async (tx) => {
    const plan = await tx.planificacion.create({
      data: {
        colegioId: user.colegioId,
        asignaturaId: data.asignaturaId,
        tipo: data.tipo,
        titulo: data.titulo,
        descripcion: data.descripcion || null,
        fechaInicio: data.fechaInicio ? fechaDesdeISO(data.fechaInicio) : null,
        fechaFin: data.fechaFin ? fechaDesdeISO(data.fechaFin) : null,
        fechaClase: esClase && data.fechaClase ? fechaDesdeISO(data.fechaClase) : null,
        estadoClase: esClase ? data.estadoClase ?? "PLANIFICADA" : null,
        ordenClase,
        padreId: data.padreId || null,
        autorId: user.id,
        oas: { create: oaCodigos.map((codigo) => ({ oaCodigo: codigo })) },
      },
      select: { id: true },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "Planificacion",
        entidadId: plan.id,
        despues: { tipo: data.tipo, titulo: data.titulo, oaCodigos },
      },
      tx
    );
    return plan;
  });

  revalidatePath("/planificacion");
  revalidatePath("/planificacion/cobertura");
  return { ok: true, id: creada.id };
}

/**
 * Genera con IA una secuencia de clases para una unidad y las inserta como
 * planificaciones tipo CLASE (que luego alimentan el leccionario y la cobertura).
 * Reautoriza sobre la asignatura de la unidad; cada clase queda auditada.
 */
export async function generarClasesUnidad(
  input: unknown
): Promise<Resultado<{ cantidad: number }>> {
  const datos = input as { unidadId?: unknown; numeroClases?: unknown };
  const unidadId = typeof datos.unidadId === "string" ? datos.unidadId : "";
  const numeroClases = Number(datos.numeroClases);
  if (!unidadId || !Number.isFinite(numeroClases) || numeroClases < 1) {
    return { ok: false, error: "Datos inválidos." };
  }

  const { user } = await requerirSesion();
  const unidad = await prisma.planificacion.findFirst({
    where: { id: unidadId, colegioId: user.colegioId, tipo: "UNIDAD", eliminadaEn: null },
    select: {
      id: true,
      titulo: true,
      asignaturaId: true,
      asignatura: { select: { docenteId: true, nombre: true, curso: { select: { nivel: true } } } },
    },
  });
  if (!unidad) return { ok: false, error: "Unidad no encontrada." };
  if (!autorizarPlanificacion(user.rol, user.id, unidad.asignatura)) {
    return { ok: false, error: "No tienes permiso para planificar esta asignatura." };
  }

  const generado = await generarClasesPlanificacion(user, {
    asignaturaId: unidad.asignaturaId,
    tituloUnidad: unidad.titulo,
    numeroClases,
  });
  if (!generado.ok) return generado;

  await prisma.$transaction(async (tx) => {
    for (const c of generado.clases) {
      const plan = await tx.planificacion.create({
        data: {
          colegioId: user.colegioId,
          asignaturaId: unidad.asignaturaId,
          tipo: "CLASE",
          titulo: c.titulo,
          descripcion: c.descripcion,
          padreId: unidad.id,
          autorId: user.id,
          oas: { create: c.oaCodigos.map((codigo) => ({ oaCodigo: codigo })) },
        },
        select: { id: true },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "CREAR",
          entidad: "Planificacion",
          entidadId: plan.id,
          despues: { tipo: "CLASE", titulo: c.titulo, oaCodigos: c.oaCodigos, generadoPorIA: true },
        },
        tx
      );
    }
  });

  revalidatePath("/planificacion");
  revalidatePath("/planificacion/cobertura");
  return { ok: true, cantidad: generado.clases.length };
}

/**
 * Auto-genera el cronograma de una unidad SIN IA: crea `cantidad` clases
 * fechadas en los días hábiles reales del curso (según el horario publicado),
 * salteando fines de semana, feriados legales y suspensiones. Es el pedido
 * explícito de la profesora ("auto-generar el cronograma según el horario").
 * Cada clase queda PLANIFICADA y auditada; la evidencia legal sigue siendo la
 * firma en el leccionario.
 */
export async function generarCronogramaUnidad(
  input: unknown
): Promise<Resultado<{ cantidad: number }>> {
  const datos = input as { unidadId?: unknown; cantidad?: unknown; desde?: unknown };
  const unidadId = typeof datos.unidadId === "string" ? datos.unidadId : "";
  const cantidad = Number(datos.cantidad);
  const desdeInput = typeof datos.desde === "string" ? datos.desde : "";
  if (!unidadId || !Number.isFinite(cantidad) || cantidad < 1 || cantidad > 40) {
    return { ok: false, error: "Datos inválidos." };
  }
  if (desdeInput && !esFechaISOValida(desdeInput)) {
    return { ok: false, error: "Fecha de inicio inválida." };
  }

  const { user } = await requerirSesion();
  const unidad = await prisma.planificacion.findFirst({
    where: { id: unidadId, colegioId: user.colegioId, tipo: "UNIDAD", eliminadaEn: null },
    select: {
      id: true,
      asignaturaId: true,
      fechaInicio: true,
      asignatura: {
        select: {
          docenteId: true,
          curso: { select: { id: true, anioEscolar: { select: { anio: true } } } },
        },
      },
    },
  });
  if (!unidad) return { ok: false, error: "Unidad no encontrada." };
  if (!autorizarPlanificacion(user.rol, user.id, unidad.asignatura)) {
    return { ok: false, error: "No tienes permiso para planificar esta asignatura." };
  }

  const anio = unidad.asignatura.curso.anioEscolar.anio;
  const [versionesHorario, suspensiones] = await Promise.all([
    prisma.horarioVersion.findMany({
      where: {
        colegioId: user.colegioId,
        estado: "PUBLICADO",
        horarioCurso: { cursoId: unidad.asignatura.curso.id },
        vigenteDesde: { lte: fechaDesdeISO(`${anio}-12-31`) },
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaDesdeISO(`${anio}-03-01`) } }],
      },
      select: {
        numero: true,
        vigenteDesde: true,
        vigenteHasta: true,
        bloques: {
          where: { colegioId: user.colegioId, asignaturaId: unidad.asignaturaId, eliminadaEn: null },
          select: { dia: true },
        },
      },
    }),
    prisma.eventoEscolar.findMany({
      where: {
        colegioId: user.colegioId,
        tipo: "SUSPENSION",
        eliminadaEn: null,
        fecha: { gte: fechaDesdeISO(`${anio}-03-01`), lte: fechaDesdeISO(`${anio}-12-31`) },
        OR: [{ cursoId: null }, { cursoId: unidad.asignatura.curso.id }],
      },
      select: { fecha: true },
    }),
  ]);

  if (!versionesHorario.some((v) => v.bloques.length > 0)) {
    return {
      ok: false,
      error: "Publica un horario con esta asignatura antes de generar el cronograma.",
    };
  }

  // Semilla: la fecha de inicio de la unidad, o hoy si la unidad no la tiene.
  const desde =
    desdeInput ||
    (unidad.fechaInicio ? isoDesdeFecha(unidad.fechaInicio) : hoyEnSantiago());

  const cronograma = generarCronograma({
    anio,
    desde,
    cantidad,
    versiones: versionesHorario.map((v) => ({
      numero: v.numero,
      vigenteDesde: isoDesdeFecha(v.vigenteDesde),
      vigenteHasta: v.vigenteHasta ? isoDesdeFecha(v.vigenteHasta) : null,
      bloques: v.bloques,
    })),
    suspensiones: suspensiones.map((e) => isoDesdeFecha(e.fecha)),
  });
  if (cronograma.length === 0) {
    return { ok: false, error: "No hay días hábiles disponibles en el rango del año escolar." };
  }

  const base =
    (
      await prisma.planificacion.aggregate({
        where: {
          colegioId: user.colegioId,
          padreId: unidad.id,
          tipo: "CLASE",
          eliminadaEn: null,
        },
        _max: { ordenClase: true },
      })
    )._max.ordenClase ?? 0;

  await prisma.$transaction(async (tx) => {
    for (const clase of cronograma) {
      const orden = base + clase.orden;
      const plan = await tx.planificacion.create({
        data: {
          colegioId: user.colegioId,
          asignaturaId: unidad.asignaturaId,
          tipo: "CLASE",
          titulo: `Clase ${orden}`,
          padreId: unidad.id,
          autorId: user.id,
          fechaClase: fechaDesdeISO(clase.fecha),
          estadoClase: "PLANIFICADA",
          ordenClase: orden,
        },
        select: { id: true },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "CREAR",
          entidad: "Planificacion",
          entidadId: plan.id,
          despues: { tipo: "CLASE", ordenClase: orden, fechaClase: clase.fecha, cronograma: true },
        },
        tx
      );
    }
  });

  revalidatePath("/planificacion");
  revalidatePath("/planificacion/cobertura");
  return { ok: true, cantidad: cronograma.length };
}

export async function editarPlanificacion(
  input: unknown,
  planificacionId: string,
  versionEsperada?: number
): Promise<Resultado> {
  const prep = await prepararEntrada(input);
  if (!prep.ok) return prep;
  const { user, data, oaCodigos } = prep;

  const previa = await prisma.planificacion.findFirst({
    where: {
      id: planificacionId,
      asignaturaId: data.asignaturaId,
      colegioId: user.colegioId,
      eliminadaEn: null,
    },
    select: {
      id: true,
      titulo: true,
      tipo: true,
      descripcion: true,
      fechaInicio: true,
      fechaFin: true,
      version: true,
      oas: { select: { oaCodigo: true } },
    },
  });
  if (!previa) return { ok: false, error: "Planificación no encontrada." };
  if (versionEsperada !== undefined && previa.version !== versionEsperada) {
    return {
      ok: false,
      error:
        "Esta planificación cambió en otra sesión. Actualiza la página antes de guardar para no perder cambios.",
    };
  }

  // El padre (si se indica) debe ser otra planificación viva de la misma
  // asignatura; no puede ser sí misma (evita un ciclo trivial).
  if (data.padreId) {
    if (data.padreId === planificacionId) {
      return { ok: false, error: "Una planificación no puede depender de sí misma." };
    }
    const padre = await prisma.planificacion.findFirst({
      where: {
        id: data.padreId,
        asignaturaId: data.asignaturaId,
        colegioId: user.colegioId,
        eliminadaEn: null,
      },
      select: { id: true },
    });
    if (!padre) return { ok: false, error: "Planificación superior inválida." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const cambio = await tx.planificacion.updateMany({
        where: {
          id: planificacionId,
          colegioId: user.colegioId,
          asignaturaId: data.asignaturaId,
          version: previa.version,
          eliminadaEn: null,
        },
        data: {
          tipo: data.tipo,
          titulo: data.titulo,
          descripcion: data.descripcion || null,
          fechaInicio: data.fechaInicio ? fechaDesdeISO(data.fechaInicio) : null,
          fechaFin: data.fechaFin ? fechaDesdeISO(data.fechaFin) : null,
          fechaClase:
            data.tipo === "CLASE" && data.fechaClase
              ? fechaDesdeISO(data.fechaClase)
              : null,
          estadoClase: data.tipo === "CLASE" ? data.estadoClase ?? "PLANIFICADA" : null,
          version: { increment: 1 },
        },
      });
      if (cambio.count !== 1) {
        throw new ErrorPlanificacionConcurrente();
      }
      await tx.planificacionHistorial.create({
        data: {
          colegioId: user.colegioId,
          planificacionId,
          version: previa.version,
          titulo: previa.titulo,
          descripcion: previa.descripcion,
          fechaInicio: previa.fechaInicio,
          fechaFin: previa.fechaFin,
          oaCodigos: previa.oas.map((o) => o.oaCodigo),
          guardadaPorId: user.id,
        },
      });
      // Reemplaza el set de OA solo después de ganar el control optimista.
      await tx.planificacionOa.deleteMany({ where: { planificacionId } });
      if (oaCodigos.length > 0) {
        await tx.planificacionOa.createMany({
          data: oaCodigos.map((oaCodigo) => ({ planificacionId, oaCodigo })),
        });
      }
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "Planificacion",
          entidadId: planificacionId,
          antes: {
            titulo: previa.titulo,
            tipo: previa.tipo,
            oaCodigos: previa.oas.map((o) => o.oaCodigo),
          },
          despues: { titulo: data.titulo, tipo: data.tipo, oaCodigos },
        },
        tx
      );
    });
  } catch (error) {
    if (error instanceof ErrorPlanificacionConcurrente) {
      return {
        ok: false,
        error:
          "Esta planificación cambió en otra sesión. Actualiza la página antes de guardar para no perder cambios.",
      };
    }
    return {
      ok: false,
      error: "No se pudo guardar la planificación. Reintenta.",
    };
  }

  revalidatePath("/planificacion");
  revalidatePath("/planificacion/cobertura");
  return { ok: true };
}

export async function guardarComoPlantilla(planificacionId: string): Promise<Resultado<{ id: string }>> {
  const { user } = await requerirSesion();
  const origen = await prisma.planificacion.findFirst({
    where: { id: planificacionId, colegioId: user.colegioId, eliminadaEn: null, esPlantilla: false },
    select: {
      id: true, asignaturaId: true, tipo: true, titulo: true, descripcion: true,
      fechaInicio: true, fechaFin: true, padreId: true, version: true,
      asignatura: { select: { docenteId: true } },
      oas: { select: { oaCodigo: true } },
    },
  });
  if (!origen || !autorizarPlanificacion(user.rol, user.id, origen.asignatura)) {
    return { ok: false, error: "Planificación no encontrada o sin permiso." };
  }
  try {
    const plantilla = await prisma.$transaction(async (tx) => {
      const creada = await tx.planificacion.create({
        data: {
          colegioId: user.colegioId,
          asignaturaId: origen.asignaturaId,
          tipo: origen.tipo,
          titulo: origen.titulo,
          descripcion: origen.descripcion,
          autorId: user.id,
          esPlantilla: true,
          origenId: origen.id,
          oas: { create: origen.oas.map((o) => ({ oaCodigo: o.oaCodigo })) },
        },
        select: { id: true },
      });
      await registrarAuditoria({ colegioId: user.colegioId, usuarioId: user.id, accion: "CREAR", entidad: "Planificacion", entidadId: creada.id, despues: { esPlantilla: true, origenId: origen.id, tipo: origen.tipo } }, tx);
      return creada;
    });
    revalidatePath("/planificacion");
    return { ok: true, id: plantilla.id };
  } catch {
    return { ok: false, error: "No se pudo guardar la plantilla." };
  }
}

export async function eliminarPlanificacion(
  asignaturaId: string,
  planificacionId: string
): Promise<Resultado> {
  const { user } = await requerirSesion();
  const asignatura = await prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId: user.colegioId },
    select: { docenteId: true },
  });
  if (!asignatura) return { ok: false, error: "Asignatura no encontrada." };
  if (!autorizarPlanificacion(user.rol, user.id, asignatura)) {
    return { ok: false, error: "No tienes permiso para eliminar esta planificación." };
  }

  const previa = await prisma.planificacion.findFirst({
    where: {
      id: planificacionId,
      asignaturaId,
      colegioId: user.colegioId,
      eliminadaEn: null,
    },
    select: { id: true, titulo: true },
  });
  if (!previa) return { ok: false, error: "Planificación no encontrada." };

  await prisma.$transaction(async (tx) => {
    await tx.planificacion.update({
      where: { id: planificacionId },
      data: { eliminadaEn: new Date(), eliminadaPorId: user.id },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "ELIMINAR",
        entidad: "Planificacion",
        entidadId: planificacionId,
        antes: { titulo: previa.titulo },
      },
      tx
    );
  });

  revalidatePath("/planificacion");
  revalidatePath("/planificacion/cobertura");
  return { ok: true };
}
