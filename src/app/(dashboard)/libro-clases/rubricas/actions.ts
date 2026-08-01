"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { asignaturaCanonica } from "@/lib/planificacion";
import {
  autorizarRubrica,
  autorizarLecturaRubrica,
  calcularPuntajeRubrica,
  guardarAplicacionRubricaSchema,
  guardarRubricaSchema,
  idRubricaSchema,
  vincularEvaluacionSchema,
  type GuardarRubricaInput,
} from "@/lib/rubricas";

type Resultado<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type UsuarioSesion = { id: string; rol: string; colegioId: string };

const seleccionAsignatura = {
  id: true,
  nombre: true,
  docenteId: true,
  curso: {
    select: { id: true, nivel: true, profesorJefeId: true },
  },
} as const;

async function buscarAsignaturaAutorizada(
  user: UsuarioSesion,
  asignaturaId: string | null
) {
  if (!asignaturaId) return autorizarRubrica(user.rol, user.id, null) ? null : undefined;
  const asignatura = await prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId: user.colegioId },
    select: seleccionAsignatura,
  });
  if (!asignatura || !autorizarRubrica(user.rol, user.id, asignatura)) return undefined;
  return asignatura;
}

async function validarOas(
  datos: GuardarRubricaInput,
  asignatura: Awaited<ReturnType<typeof buscarAsignaturaAutorizada>>,
  colegioId: string
): Promise<string[] | null> {
  if (datos.oaCodigos.length === 0) return [];
  const canonica = asignatura ? asignaturaCanonica(asignatura.nombre) : null;
  const oas = await prisma.oa.findMany({
    where: {
      codigo: { in: datos.oaCodigos },
      ...(asignatura ? { nivel: asignatura.curso.nivel } : {}),
      ...(canonica ? { asignatura: canonica } : {}),
      // Oa es un catálogo global; colegioId se valida en la entidad Rubrica.
    },
    select: { codigo: true },
  });
  void colegioId;
  return oas.length === datos.oaCodigos.length ? oas.map((oa) => oa.codigo) : null;
}

function datosCriterios(datos: GuardarRubricaInput, colegioId: string) {
  return datos.criterios.map((criterio, orden) => {
    const puntajeMax = Math.max(...criterio.niveles.map((nivel) => nivel.puntaje));
    return {
      colegioId,
      orden,
      descripcion: criterio.descripcion,
      peso: criterio.peso,
      puntajeMax,
      niveles: {
        create: criterio.niveles.map((nivel, nivelOrden) => ({
          colegioId,
          orden: nivelOrden,
          etiqueta: nivel.etiqueta,
          descriptor: nivel.descriptor,
          puntaje: nivel.puntaje,
        })),
      },
    };
  });
}

function resumenRubrica(datos: GuardarRubricaInput, version: number) {
  return {
    nombre: datos.nombre,
    tipo: datos.tipo,
    version,
    asignaturaId: datos.asignaturaId,
    criterios: datos.criterios.length,
    oas: datos.oaCodigos,
  };
}

function revalidarRubricas(id?: string) {
  revalidatePath("/libro-clases/rubricas");
  if (id) revalidatePath(`/libro-clases/rubricas/${id}`);
}

export async function crearRubrica(
  input: unknown
): Promise<Resultado<{ id: string }>> {
  const parsed = guardarRubricaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const datos = parsed.data;
  const { user } = await requerirSesion();
  const asignatura = await buscarAsignaturaAutorizada(user, datos.asignaturaId);
  if (asignatura === undefined) {
    return { ok: false, error: "No tienes permiso para crear este instrumento." };
  }
  const oas = await validarOas(datos, asignatura, user.colegioId);
  if (!oas) return { ok: false, error: "Hay objetivos de aprendizaje que no corresponden a la asignatura." };

  try {
    const rubrica = await prisma.$transaction(async (tx) => {
      const creada = await tx.rubrica.create({
        data: {
          colegioId: user.colegioId,
          asignaturaId: datos.asignaturaId,
          nombre: datos.nombre,
          descripcion: datos.descripcion || null,
          tipo: datos.tipo,
          estado: "BORRADOR",
          grupoVersionId: randomUUID(),
          version: 1,
          autorId: user.id,
          criterios: { create: datosCriterios(datos, user.colegioId) },
          oas: {
            create: oas.map((oaCodigo) => ({ colegioId: user.colegioId, oaCodigo })),
          },
        },
        select: { id: true },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "CREAR",
          entidad: "Rubrica",
          entidadId: creada.id,
          despues: resumenRubrica(datos, 1),
        },
        tx
      );
      return creada;
    });
    revalidarRubricas(rubrica.id);
    return { ok: true, id: rubrica.id };
  } catch {
    return { ok: false, error: "No se pudo crear el instrumento. Reintenta." };
  }
}

export async function actualizarRubrica(
  rubricaId: string,
  input: unknown
): Promise<Resultado> {
  const id = idRubricaSchema.safeParse(rubricaId);
  const parsed = guardarRubricaSchema.safeParse(input);
  if (!id.success || !parsed.success) {
    return { ok: false, error: parsed.success ? "Instrumento inválido." : parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const datos = parsed.data;
  const { user } = await requerirSesion();
  const rubrica = await prisma.rubrica.findFirst({
    where: { id: id.data, colegioId: user.colegioId, eliminadaEn: null },
    select: {
      id: true,
      estado: true,
      version: true,
      nombre: true,
      tipo: true,
      asignaturaId: true,
      asignatura: { select: seleccionAsignatura },
      _count: { select: { criterios: true, aplicaciones: true } },
    },
  });
  if (!rubrica || !autorizarRubrica(user.rol, user.id, rubrica.asignatura)) {
    return { ok: false, error: "Instrumento no encontrado o sin permiso." };
  }
  if (rubrica.estado !== "BORRADOR") {
    return { ok: false, error: "Una rúbrica publicada es inmutable. Crea una nueva versión para editarla." };
  }
  if (rubrica._count.aplicaciones > 0) {
    return { ok: false, error: "Este borrador ya tiene aplicaciones y no se puede reestructurar." };
  }
  const asignatura = await buscarAsignaturaAutorizada(user, datos.asignaturaId);
  if (asignatura === undefined) {
    return { ok: false, error: "No tienes permiso sobre la asignatura seleccionada." };
  }
  const oas = await validarOas(datos, asignatura, user.colegioId);
  if (!oas) return { ok: false, error: "Hay objetivos de aprendizaje que no corresponden a la asignatura." };

  try {
    await prisma.$transaction(async (tx) => {
      // El predicado de estado evita que una publicación concurrente convierta
      // en mutable una versión que acaba de quedar histórica.
      const editable = await tx.rubrica.updateMany({
        where: {
          id: rubrica.id,
          colegioId: user.colegioId,
          estado: "BORRADOR",
          eliminadaEn: null,
        },
        data: {
          asignaturaId: datos.asignaturaId,
          nombre: datos.nombre,
          descripcion: datos.descripcion || null,
          tipo: datos.tipo,
        },
      });
      if (editable.count !== 1) throw new Error("RUBRICA_NO_EDITABLE");
      await tx.nivelCriterio.deleteMany({
        where: { colegioId: user.colegioId, criterio: { rubricaId: rubrica.id } },
      });
      await tx.criterioRubrica.deleteMany({
        where: { colegioId: user.colegioId, rubricaId: rubrica.id },
      });
      await tx.rubricaOa.deleteMany({
        where: { colegioId: user.colegioId, rubricaId: rubrica.id },
      });
      await tx.rubrica.update({
        where: { id: rubrica.id },
        data: {
          criterios: { create: datosCriterios(datos, user.colegioId) },
          oas: {
            create: oas.map((oaCodigo) => ({ colegioId: user.colegioId, oaCodigo })),
          },
        },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "Rubrica",
          entidadId: rubrica.id,
          antes: {
            nombre: rubrica.nombre,
            tipo: rubrica.tipo,
            asignaturaId: rubrica.asignaturaId,
            criterios: rubrica._count.criterios,
          },
          despues: resumenRubrica(datos, rubrica.version),
        },
        tx
      );
    });
    revalidarRubricas(rubrica.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudieron guardar los cambios. Reintenta." };
  }
}

export async function publicarRubrica(rubricaId: string): Promise<Resultado> {
  const id = idRubricaSchema.safeParse(rubricaId);
  if (!id.success) return { ok: false, error: "Instrumento inválido." };
  const { user } = await requerirSesion();
  const rubrica = await prisma.rubrica.findFirst({
    where: { id: id.data, colegioId: user.colegioId, eliminadaEn: null },
    select: {
      id: true,
      estado: true,
      nombre: true,
      version: true,
      asignatura: { select: seleccionAsignatura },
      criterios: { select: { id: true, _count: { select: { niveles: true } } } },
    },
  });
  if (!rubrica || !autorizarRubrica(user.rol, user.id, rubrica.asignatura)) {
    return { ok: false, error: "Instrumento no encontrado o sin permiso." };
  }
  if (rubrica.estado !== "BORRADOR") {
    return { ok: false, error: "Solo se pueden publicar borradores." };
  }
  if (rubrica.criterios.length === 0 || rubrica.criterios.some((c) => c._count.niveles < 2)) {
    return { ok: false, error: "Completa todos los criterios y sus niveles antes de publicar." };
  }
  const ahora = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const publicada = await tx.rubrica.updateMany({
        where: {
          id: rubrica.id,
          colegioId: user.colegioId,
          estado: "BORRADOR",
          eliminadaEn: null,
        },
        data: { estado: "PUBLICADA", publicadaEn: ahora, publicadaPorId: user.id },
      });
      if (publicada.count !== 1) throw new Error("RUBRICA_YA_PUBLICADA");
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "Rubrica",
          entidadId: rubrica.id,
          antes: { estado: "BORRADOR" },
          despues: { estado: "PUBLICADA", version: rubrica.version },
        },
        tx
      );
    });
    revalidarRubricas(rubrica.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo publicar el instrumento. Reintenta." };
  }
}

export async function crearVersionRubrica(
  rubricaId: string
): Promise<Resultado<{ id: string }>> {
  const id = idRubricaSchema.safeParse(rubricaId);
  if (!id.success) return { ok: false, error: "Instrumento inválido." };
  const { user } = await requerirSesion();
  const origen = await prisma.rubrica.findFirst({
    where: { id: id.data, colegioId: user.colegioId, eliminadaEn: null },
    include: {
      asignatura: { select: seleccionAsignatura },
      oas: { select: { oaCodigo: true } },
      criterios: {
        orderBy: { orden: "asc" },
        include: { niveles: { orderBy: { orden: "asc" } } },
      },
    },
  });
  if (!origen || !autorizarRubrica(user.rol, user.id, origen.asignatura)) {
    return { ok: false, error: "Instrumento no encontrado o sin permiso." };
  }
  if (origen.estado === "BORRADOR") return { ok: true, id: origen.id };

  const borrador = await prisma.rubrica.findFirst({
    where: {
      colegioId: user.colegioId,
      grupoVersionId: origen.grupoVersionId,
      estado: "BORRADOR",
      eliminadaEn: null,
    },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (borrador) return { ok: true, id: borrador.id };

  const ultima = await prisma.rubrica.findFirst({
    where: { colegioId: user.colegioId, grupoVersionId: origen.grupoVersionId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (ultima?.version ?? origen.version) + 1;
  try {
    const creada = await prisma.$transaction(async (tx) => {
      const nueva = await tx.rubrica.create({
        data: {
          colegioId: user.colegioId,
          asignaturaId: origen.asignaturaId,
          nombre: origen.nombre,
          descripcion: origen.descripcion,
          tipo: origen.tipo,
          estado: "BORRADOR",
          grupoVersionId: origen.grupoVersionId,
          version,
          autorId: user.id,
          oas: {
            create: origen.oas.map(({ oaCodigo }) => ({ colegioId: user.colegioId, oaCodigo })),
          },
          criterios: {
            create: origen.criterios.map((criterio) => ({
              colegioId: user.colegioId,
              orden: criterio.orden,
              descripcion: criterio.descripcion,
              peso: criterio.peso,
              puntajeMax: criterio.puntajeMax,
              niveles: {
                create: criterio.niveles.map((nivel) => ({
                  colegioId: user.colegioId,
                  orden: nivel.orden,
                  etiqueta: nivel.etiqueta,
                  descriptor: nivel.descriptor,
                  puntaje: nivel.puntaje,
                })),
              },
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
          entidad: "Rubrica",
          entidadId: nueva.id,
          despues: { grupoVersionId: origen.grupoVersionId, version, origenId: origen.id },
        },
        tx
      );
      return nueva;
    });
    revalidarRubricas(creada.id);
    return { ok: true, id: creada.id };
  } catch {
    return { ok: false, error: "No se pudo crear una nueva versión. Reintenta." };
  }
}

export async function archivarRubrica(rubricaId: string): Promise<Resultado> {
  const id = idRubricaSchema.safeParse(rubricaId);
  if (!id.success) return { ok: false, error: "Instrumento inválido." };
  const { user } = await requerirSesion();
  const rubrica = await prisma.rubrica.findFirst({
    where: { id: id.data, colegioId: user.colegioId, eliminadaEn: null },
    select: { id: true, estado: true, asignatura: { select: seleccionAsignatura } },
  });
  if (!rubrica || !autorizarRubrica(user.rol, user.id, rubrica.asignatura)) {
    return { ok: false, error: "Instrumento no encontrado o sin permiso." };
  }
  if (rubrica.estado === "ARCHIVADA") return { ok: true };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rubrica.update({ where: { id: rubrica.id }, data: { estado: "ARCHIVADA" } });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "Rubrica",
          entidadId: rubrica.id,
          antes: { estado: rubrica.estado },
          despues: { estado: "ARCHIVADA" },
        },
        tx
      );
    });
    revalidarRubricas(rubrica.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo archivar el instrumento. Reintenta." };
  }
}

export async function eliminarRubrica(rubricaId: string): Promise<Resultado> {
  const id = idRubricaSchema.safeParse(rubricaId);
  if (!id.success) return { ok: false, error: "Instrumento inválido." };
  const { user } = await requerirSesion();
  const rubrica = await prisma.rubrica.findFirst({
    where: { id: id.data, colegioId: user.colegioId, eliminadaEn: null },
    select: { id: true, estado: true, version: true, asignatura: { select: seleccionAsignatura } },
  });
  if (!rubrica || !autorizarRubrica(user.rol, user.id, rubrica.asignatura)) {
    return { ok: false, error: "Instrumento no encontrado o sin permiso." };
  }
  if (rubrica.estado === "ARCHIVADA") {
    return { ok: false, error: "El instrumento ya está archivado y conserva su historial." };
  }
  const ahora = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      if (rubrica.estado === "PUBLICADA") {
        const cambio = await tx.rubrica.updateMany({
          where: { id: rubrica.id, colegioId: user.colegioId, estado: "PUBLICADA", eliminadaEn: null },
          data: { estado: "ARCHIVADA" },
        });
        if (cambio.count !== 1) throw new Error("CONFLICTO_RUBRICA");
        await registrarAuditoria(
          {
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "MODIFICAR",
            entidad: "Rubrica",
            entidadId: rubrica.id,
            antes: { estado: rubrica.estado, version: rubrica.version },
            despues: { estado: "ARCHIVADA", conservaHistorial: true },
          },
          tx
        );
        return;
      }
      const [vinculos, aplicaciones] = await Promise.all([
        tx.evaluacion.count({ where: { colegioId: user.colegioId, rubricaId: rubrica.id } }),
        tx.aplicacionRubrica.count({ where: { colegioId: user.colegioId, rubricaId: rubrica.id } }),
      ]);
      if (vinculos > 0 || aplicaciones > 0) throw new Error("RUBRICA_CON_HISTORIAL");
      const cambio = await tx.rubrica.updateMany({
        where: { id: rubrica.id, colegioId: user.colegioId, estado: "BORRADOR", eliminadaEn: null },
        data: { eliminadaEn: ahora, eliminadaPorId: user.id },
      });
      if (cambio.count !== 1) throw new Error("CONFLICTO_RUBRICA");
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "ELIMINAR",
          entidad: "Rubrica",
          entidadId: rubrica.id,
          antes: { estado: "BORRADOR", version: rubrica.version },
          despues: { eliminada: true },
        },
        tx
      );
    });
    revalidarRubricas();
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar el instrumento. Reintenta." };
  }
}

export async function vincularRubricaEvaluacion(input: unknown): Promise<Resultado> {
  const parsed = vincularEvaluacionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Selecciona una evaluación válida." };
  const { user } = await requerirSesion();
  const [rubrica, evaluacion] = await Promise.all([
    prisma.rubrica.findFirst({
      where: { id: parsed.data.rubricaId, colegioId: user.colegioId, eliminadaEn: null },
      select: { id: true, estado: true, asignaturaId: true, asignatura: { select: seleccionAsignatura } },
    }),
    prisma.evaluacion.findFirst({
      where: { id: parsed.data.evaluacionId, colegioId: user.colegioId, eliminadaEn: null },
      select: { id: true, rubricaId: true, asignaturaId: true, asignatura: { select: seleccionAsignatura } },
    }),
  ]);
  if (!rubrica || !evaluacion || !autorizarRubrica(user.rol, user.id, evaluacion.asignatura)) {
    return { ok: false, error: "Evaluación o instrumento no encontrado." };
  }
  if (!autorizarLecturaRubrica(user.rol, user.id, rubrica.asignatura, rubrica.estado)) {
    return { ok: false, error: "No tienes permiso para usar este instrumento." };
  }
  if (rubrica.estado !== "PUBLICADA") {
    return { ok: false, error: "Publica la rúbrica antes de aplicarla." };
  }
  if (rubrica.asignaturaId && rubrica.asignaturaId !== evaluacion.asignaturaId) {
    return { ok: false, error: "La rúbrica pertenece a otra asignatura." };
  }
  if (evaluacion.rubricaId && evaluacion.rubricaId !== rubrica.id) {
    return { ok: false, error: "La evaluación ya tiene otro instrumento asociado." };
  }
  if (evaluacion.rubricaId === rubrica.id) return { ok: true };
  try {
    await prisma.$transaction(async (tx) => {
      const vigente = await tx.rubrica.findFirst({
        where: { id: rubrica.id, colegioId: user.colegioId, estado: "PUBLICADA", eliminadaEn: null },
        select: { id: true },
      });
      if (!vigente) throw new Error("RUBRICA_NO_DISPONIBLE");
      const cambio = await tx.evaluacion.updateMany({
        where: { id: evaluacion.id, colegioId: user.colegioId, rubricaId: null, eliminadaEn: null },
        data: { rubricaId: rubrica.id },
      });
      if (cambio.count !== 1) throw new Error("EVALUACION_YA_VINCULADA");
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "Evaluacion",
          entidadId: evaluacion.id,
          antes: { rubricaId: null },
          despues: { rubricaId: rubrica.id },
        },
        tx
      );
    });
    revalidarRubricas(rubrica.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo asociar la evaluación. Reintenta." };
  }
}

export async function guardarAplicacionRubrica(
  input: unknown
): Promise<Resultado<{ aplicacionId: string; puntajeTotal: number; finalizada: boolean }>> {
  const parsed = guardarAplicacionRubricaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los niveles y la retroalimentación." };
  const datos = parsed.data;
  const { user } = await requerirSesion();
  const evaluacion = await prisma.evaluacion.findFirst({
    where: {
      id: datos.evaluacionId,
      colegioId: user.colegioId,
      eliminadaEn: null,
      rubricaId: datos.rubricaId,
    },
    select: {
      id: true,
      rubricaId: true,
      asignaturaId: true,
      asignatura: { select: seleccionAsignatura },
      rubrica: {
        select: {
          id: true,
          estado: true,
          eliminadaEn: true,
          criterios: {
            orderBy: { orden: "asc" },
            select: {
              id: true,
              peso: true,
              puntajeMax: true,
              niveles: { select: { id: true, puntaje: true } },
            },
          },
        },
      },
    },
  });
  if (!evaluacion || !evaluacion.rubrica || !autorizarRubrica(user.rol, user.id, evaluacion.asignatura)) {
    return { ok: false, error: "Evaluación no encontrada o sin permiso." };
  }
  if (evaluacion.rubrica.eliminadaEn || !["PUBLICADA", "ARCHIVADA"].includes(evaluacion.rubrica.estado)) {
    return { ok: false, error: "El instrumento no está disponible para aplicación." };
  }

  const matricula = await prisma.matricula.findFirst({
    where: {
      colegioId: user.colegioId,
      cursoId: evaluacion.asignatura.curso.id,
      estudianteId: datos.estudianteId,
      estado: "ACTIVA",
    },
    select: { id: true },
  });
  if (!matricula) return { ok: false, error: "El estudiante no pertenece a este curso." };

  const criterios = new Map(evaluacion.rubrica.criterios.map((criterio) => [criterio.id, criterio]));
  const idsSeleccionados = new Set<string>();
  const selecciones: Array<{
    criterioId: string;
    nivelId: string;
    puntaje: number;
    comentario: string | null;
  }> = [];
  for (const seleccion of datos.selecciones) {
    const criterio = criterios.get(seleccion.criterioId);
    const nivel = criterio?.niveles.find((item) => item.id === seleccion.nivelId);
    if (!criterio || !nivel || idsSeleccionados.has(criterio.id)) {
      return { ok: false, error: "Hay una selección que no pertenece a esta rúbrica." };
    }
    idsSeleccionados.add(criterio.id);
    selecciones.push({
      criterioId: criterio.id,
      nivelId: nivel.id,
      puntaje: Number(nivel.puntaje),
      comentario: seleccion.comentario || null,
    });
  }
  if (datos.finalizar && selecciones.length !== criterios.size) {
    return { ok: false, error: "Selecciona un nivel para cada criterio antes de finalizar." };
  }

  const calculo = calcularPuntajeRubrica(
    evaluacion.rubrica.criterios.map((criterio) => ({
      id: criterio.id,
      peso: Number(criterio.peso),
      puntajeMax: Number(criterio.puntajeMax),
    })),
    selecciones
  );
  const previa = await prisma.aplicacionRubrica.findUnique({
    where: {
      colegioId_evaluacionId_estudianteId: {
        colegioId: user.colegioId,
        evaluacionId: evaluacion.id,
        estudianteId: datos.estudianteId,
      },
    },
    select: { id: true, estado: true, puntajeTotal: true, retroalimentacion: true },
  });
  if (previa && previa.estado !== "BORRADOR") {
    return { ok: false, error: "La aplicación ya fue finalizada y conserva su resultado histórico." };
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const aplicacion = previa
        ? await (async () => {
            const actualizada = await tx.aplicacionRubrica.updateMany({
              where: {
                id: previa.id,
                colegioId: user.colegioId,
                estado: "BORRADOR",
              },
              data: {
                estado: datos.finalizar ? "FINALIZADA" : "BORRADOR",
                puntajeTotal: calculo.total,
                retroalimentacion: datos.retroalimentacion || null,
                evaluadorId: user.id,
                finalizadaEn: datos.finalizar ? new Date() : null,
              },
            });
            if (actualizada.count !== 1) throw new Error("APLICACION_CERRADA");
            return { id: previa.id };
          })()
        : await tx.aplicacionRubrica.create({
            data: {
              colegioId: user.colegioId,
              evaluacionId: evaluacion.id,
              rubricaId: datos.rubricaId,
              estudianteId: datos.estudianteId,
              estado: datos.finalizar ? "FINALIZADA" : "BORRADOR",
              puntajeTotal: calculo.total,
              retroalimentacion: datos.retroalimentacion || null,
              evaluadorId: user.id,
              finalizadaEn: datos.finalizar ? new Date() : null,
            },
            select: { id: true },
          });

      await tx.puntajeCriterioRubrica.deleteMany({
        where: {
          colegioId: user.colegioId,
          aplicacionId: aplicacion.id,
          ...(selecciones.length > 0
            ? { criterioId: { notIn: selecciones.map((item) => item.criterioId) } }
            : {}),
        },
      });
      for (const seleccion of selecciones) {
        await tx.puntajeCriterioRubrica.upsert({
          where: {
            colegioId_aplicacionId_criterioId: {
              colegioId: user.colegioId,
              aplicacionId: aplicacion.id,
              criterioId: seleccion.criterioId,
            },
          },
          create: {
            colegioId: user.colegioId,
            aplicacionId: aplicacion.id,
            ...seleccion,
          },
          update: {
            nivelId: seleccion.nivelId,
            puntaje: seleccion.puntaje,
            comentario: seleccion.comentario,
          },
        });
      }
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: previa ? "MODIFICAR" : "CREAR",
          entidad: "AplicacionRubrica",
          entidadId: aplicacion.id,
          antes: previa
            ? { estado: previa.estado, puntajeTotal: previa.puntajeTotal ? Number(previa.puntajeTotal) : null }
            : undefined,
          despues: {
            estado: datos.finalizar ? "FINALIZADA" : "BORRADOR",
            puntajeTotal: calculo.total,
            puntajeMaximo: calculo.maximo,
            criteriosRespondidos: selecciones.length,
            conRetroalimentacion: Boolean(datos.retroalimentacion),
          },
        },
        tx
      );
      return aplicacion;
    });
    revalidatePath(`/libro-clases/rubricas/${datos.rubricaId}/aplicar/${datos.evaluacionId}`);
    return {
      ok: true,
      aplicacionId: resultado.id,
      puntajeTotal: calculo.total,
      finalizada: datos.finalizar,
    };
  } catch {
    return { ok: false, error: "No se pudo guardar la aplicación. Reintenta." };
  }
}

export async function anularAplicacionRubrica(aplicacionId: string): Promise<Resultado> {
  const id = idRubricaSchema.safeParse(aplicacionId);
  if (!id.success) return { ok: false, error: "Aplicación inválida." };
  const { user } = await requerirSesion();
  const aplicacion = await prisma.aplicacionRubrica.findFirst({
    where: { id: id.data, colegioId: user.colegioId },
    select: {
      id: true,
      estado: true,
      evaluacionId: true,
      rubricaId: true,
      evaluacion: { select: { asignatura: { select: seleccionAsignatura } } },
    },
  });
  if (!aplicacion || !autorizarRubrica(user.rol, user.id, aplicacion.evaluacion.asignatura)) {
    return { ok: false, error: "Aplicación no encontrada o sin permiso." };
  }
  if (aplicacion.estado === "ANULADA") return { ok: true };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.aplicacionRubrica.update({
        where: { id: aplicacion.id },
        data: { estado: "ANULADA", anuladaEn: new Date(), anuladaPorId: user.id },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "ANULAR",
          entidad: "AplicacionRubrica",
          entidadId: aplicacion.id,
          antes: { estado: aplicacion.estado },
          despues: { estado: "ANULADA" },
        },
        tx
      );
    });
    revalidatePath(`/libro-clases/rubricas/${aplicacion.rubricaId}/aplicar/${aplicacion.evaluacionId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo anular la aplicación. Reintenta." };
  }
}

/**
 * Genera con IA el instrumento completo (criterios + niveles) a partir de la
 * descripción de la evaluación. Devuelve datos para llenar el editor: la
 * persona docente revisa, ajusta y recién ahí guarda el borrador.
 */
export async function generarRubricaConIA(input: unknown): Promise<
  Resultado<{
    nombre: string;
    descripcion: string;
    criterios: { descripcion: string; peso: number; niveles: { etiqueta: string; descriptor: string; puntaje: number }[] }[];
  }>
> {
  const datos = input as { descripcionEvaluacion?: unknown; tipo?: unknown; contexto?: unknown };
  const descripcionEvaluacion =
    typeof datos.descripcionEvaluacion === "string" ? datos.descripcionEvaluacion : "";
  const tipo = datos.tipo === "PAUTA_COTEJO" ? "PAUTA_COTEJO" : "RUBRICA";
  const contexto = typeof datos.contexto === "string" ? datos.contexto.slice(0, 120) : "";

  const { user } = await requerirSesion();
  const puede =
    ["ADMIN", "DIRECTOR", "UTP", "PROFESOR", "PROFESOR_JEFE"].includes(user.rol);
  if (!puede) return { ok: false, error: "No tienes permiso para crear instrumentos." };

  const { generarRubricaIA } = await import("@/lib/ia/rubrica");
  const r = await generarRubricaIA(user, {
    descripcionEvaluacion,
    tipo,
    contexto: contexto || undefined,
  });
  if (!r.ok) return r;
  return { ok: true, nombre: r.nombre, descripcion: r.descripcion, criterios: r.criterios };
}
