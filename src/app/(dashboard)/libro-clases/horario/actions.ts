"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { esFechaISOValida, fechaDesdeISO, hoyEnSantiago } from "@/lib/fecha";

const ROLES_GESTION = new Set(["ADMIN", "DIRECTOR", "UTP"]);
const HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const schemaBloque = z
  .object({
    asignaturaId: z.string().min(1),
    dia: z.number().int().min(1).max(5),
    horaInicio: z.string().regex(HORA),
    horaFin: z.string().regex(HORA),
    horarioVersionId: z.string().min(1).optional(),
  })
  .refine((datos) => datos.horaInicio < datos.horaFin, {
    message: "La hora de término debe ser posterior al inicio.",
    path: ["horaFin"],
  });

const schemaActualizar = schemaBloque.and(
  z.object({ bloqueId: z.string().min(1) })
);
const schemaEliminar = z.object({ bloqueId: z.string().min(1) });

type DatosBloque = z.infer<typeof schemaBloque>;
type Cliente = Prisma.TransactionClient;
type BloqueRespuesta = {
  id: string;
  asignaturaId: string;
  dia: number;
  horaInicio: string;
  horaFin: string;
  asignatura: { nombre: string; color: string | null };
};

type ResultadoBloque =
  | { ok: true; bloque: BloqueRespuesta }
  | { ok: false; error: string };
type ResultadoSimple = { ok: true } | { ok: false; error: string };
type Resultado<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

class ErrorHorario extends Error {}

function horaAMinutos(hora: string) {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

async function resolverVersionParaCrear(
  tx: Cliente,
  datos: DatosBloque,
  colegioId: string,
  cursoId: string
) {
  if (!datos.horarioVersionId) {
    throw new ErrorHorario("Crea o abre una versión en borrador antes de editar el horario.");
  }
  const version = await tx.horarioVersion.findFirst({
    where: { id: datos.horarioVersionId, colegioId, estado: "BORRADOR", horarioCurso: { cursoId, colegioId } },
    select: { id: true },
  });
  if (!version) throw new ErrorHorario("La versión ya no es editable.");
  return version.id;
}

function exigirGestion(rol: string) {
  if (!ROLES_GESTION.has(rol)) {
    throw new ErrorHorario("No tienes permiso para editar el horario.");
  }
}

async function buscarAsignatura(
  tx: Cliente,
  asignaturaId: string,
  colegioId: string
) {
  const asignatura = await tx.asignatura.findFirst({
    where: { id: asignaturaId, colegioId },
    select: {
      id: true,
      cursoId: true,
      docenteId: true,
      nombre: true,
      color: true,
    },
  });
  if (!asignatura) throw new ErrorHorario("Asignatura no encontrada.");
  return asignatura;
}

async function validarCruces(
  tx: Cliente,
  datos: DatosBloque,
  contexto: { colegioId: string; cursoId: string; docenteId: string | null; horarioVersionId: string },
  omitirBloqueId?: string
) {
  const intervalo = {
    ...(omitirBloqueId ? { id: { not: omitirBloqueId } } : {}),
    eliminadaEn: null,
    horarioVersionId: contexto.horarioVersionId,
    dia: datos.dia,
    horaInicio: { lt: datos.horaFin },
    horaFin: { gt: datos.horaInicio },
  };

  const cruceCurso = await tx.bloqueHorario.findFirst({
    where: {
      ...intervalo,
      asignatura: {
        colegioId: contexto.colegioId,
        cursoId: contexto.cursoId,
      },
    },
    select: { id: true },
  });
  if (cruceCurso) {
    throw new ErrorHorario("Ese horario se cruza con otro bloque del curso.");
  }

  if (!contexto.docenteId) return;
  const cruceDocente = await tx.bloqueHorario.findFirst({
    where: {
      ...intervalo,
      asignatura: {
        colegioId: contexto.colegioId,
        docenteId: contexto.docenteId,
      },
    },
    select: { id: true },
  });
  if (cruceDocente) {
    throw new ErrorHorario("El docente ya tiene otro bloque en ese horario.");
  }
}

async function transaccionSerializable<T>(
  operacion: (tx: Cliente) => Promise<T>
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

function errorResultado(error: unknown): { ok: false; error: string } {
  if (error instanceof ErrorHorario) return { ok: false, error: error.message };
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return {
      ok: false,
      error: "El horario cambió al mismo tiempo. Revisa la grilla e inténtalo de nuevo.",
    };
  }
  return { ok: false, error: "No fue posible guardar el horario." };
}

function revalidarHorario() {
  revalidatePath("/libro-clases/horario");
  revalidatePath("/libro-clases/asistencia");
  revalidatePath("/libro-clases/firma");
  revalidatePath("/dashboard");
}

export async function crearBloqueHorario(
  input: unknown
): Promise<ResultadoBloque> {
  const parsed = schemaBloque.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revisa el día y el rango de horas." };
  }

  const { user } = await requerirSesion();
  try {
    exigirGestion(user.rol);
    const bloque = await transaccionSerializable(async (tx) => {
      const asignatura = await buscarAsignatura(
        tx,
        parsed.data.asignaturaId,
        user.colegioId
      );
      const horarioVersionId = await resolverVersionParaCrear(
        tx,
        parsed.data,
        user.colegioId,
        asignatura.cursoId
      );
      await validarCruces(tx, parsed.data, {
        colegioId: user.colegioId,
        cursoId: asignatura.cursoId,
        docenteId: asignatura.docenteId,
        horarioVersionId,
      });

      const creado = await tx.bloqueHorario.create({
        data: {
          ...parsed.data,
          colegioId: user.colegioId,
          horarioVersionId,
          horaInicioMin: horaAMinutos(parsed.data.horaInicio),
          horaFinMin: horaAMinutos(parsed.data.horaFin),
        },
        select: {
          id: true,
          asignaturaId: true,
          dia: true,
          horaInicio: true,
          horaFin: true,
          asignatura: { select: { nombre: true, color: true } },
        },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "CREAR",
          entidad: "BloqueHorario",
          entidadId: creado.id,
          despues: {
            asignaturaId: creado.asignaturaId,
            cursoId: asignatura.cursoId,
            dia: creado.dia,
            horaInicio: creado.horaInicio,
            horaFin: creado.horaFin,
          },
        },
        tx
      );
      return creado;
    });
    revalidarHorario();
    return { ok: true, bloque };
  } catch (error) {
    return errorResultado(error);
  }
}

export async function actualizarBloqueHorario(
  input: unknown
): Promise<ResultadoBloque> {
  const parsed = schemaActualizar.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revisa el día y el rango de horas." };
  }

  const { user } = await requerirSesion();
  try {
    exigirGestion(user.rol);
    const bloque = await transaccionSerializable(async (tx) => {
      const actual = await tx.bloqueHorario.findFirst({
        where: {
          id: parsed.data.bloqueId,
          eliminadaEn: null,
          asignatura: { colegioId: user.colegioId },
        },
        select: {
          id: true,
          asignaturaId: true,
          dia: true,
          horaInicio: true,
          horaFin: true,
          asignatura: { select: { cursoId: true } },
          horarioVersionId: true,
          horarioVersion: { select: { estado: true } },
          _count: { select: { clases: true } },
        },
      });
      if (!actual) throw new ErrorHorario("Bloque horario no encontrado.");
      if (actual._count.clases > 0) {
        throw new ErrorHorario(
          "Este bloque ya tiene clases registradas y debe conservarse sin cambios."
        );
      }
      if (!actual.horarioVersionId || actual.horarioVersion?.estado !== "BORRADOR") {
        throw new ErrorHorario("El horario vigente es histórico. Crea una nueva versión para editarlo.");
      }

      const destino = await buscarAsignatura(
        tx,
        parsed.data.asignaturaId,
        user.colegioId
      );
      const horarioVersionId = actual.horarioVersionId;
      if (destino.cursoId !== actual.asignatura.cursoId) {
        throw new ErrorHorario("La asignatura debe pertenecer al mismo curso.");
      }

      await validarCruces(
        tx,
        parsed.data,
        {
          colegioId: user.colegioId,
          cursoId: destino.cursoId,
          docenteId: destino.docenteId,
          horarioVersionId,
        },
        actual.id
      );

      const actualizado = await tx.bloqueHorario.update({
        where: { id: actual.id },
        data: {
          asignaturaId: parsed.data.asignaturaId,
          dia: parsed.data.dia,
          horaInicio: parsed.data.horaInicio,
          horaFin: parsed.data.horaFin,
          horarioVersionId,
          horaInicioMin: horaAMinutos(parsed.data.horaInicio),
          horaFinMin: horaAMinutos(parsed.data.horaFin),
        },
        select: {
          id: true,
          asignaturaId: true,
          dia: true,
          horaInicio: true,
          horaFin: true,
          asignatura: { select: { nombre: true, color: true } },
        },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "MODIFICAR",
          entidad: "BloqueHorario",
          entidadId: actual.id,
          antes: {
            asignaturaId: actual.asignaturaId,
            cursoId: actual.asignatura.cursoId,
            dia: actual.dia,
            horaInicio: actual.horaInicio,
            horaFin: actual.horaFin,
          },
          despues: {
            asignaturaId: actualizado.asignaturaId,
            cursoId: destino.cursoId,
            dia: actualizado.dia,
            horaInicio: actualizado.horaInicio,
            horaFin: actualizado.horaFin,
          },
        },
        tx
      );
      return {
        ...actualizado,
        asignatura: { nombre: destino.nombre, color: destino.color },
      };
    });
    revalidarHorario();
    return { ok: true, bloque };
  } catch (error) {
    return errorResultado(error);
  }
}

export async function eliminarBloqueHorario(
  input: unknown
): Promise<ResultadoSimple> {
  const parsed = schemaEliminar.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bloque inválido." };

  const { user } = await requerirSesion();
  try {
    exigirGestion(user.rol);
    await transaccionSerializable(async (tx) => {
      const actual = await tx.bloqueHorario.findFirst({
        where: {
          id: parsed.data.bloqueId,
          eliminadaEn: null,
          asignatura: { colegioId: user.colegioId },
        },
        select: {
          id: true,
          asignaturaId: true,
          dia: true,
          horaInicio: true,
          horaFin: true,
          asignatura: { select: { cursoId: true } },
          _count: { select: { clases: true } },
          horarioVersionId: true,
          horarioVersion: { select: { estado: true } },
        },
      });
      if (!actual) throw new ErrorHorario("Bloque horario no encontrado.");
      if (actual._count.clases > 0) {
        throw new ErrorHorario(
          "Este bloque ya tiene clases registradas y no se puede quitar."
        );
      }
      if (!actual.horarioVersionId || actual.horarioVersion?.estado !== "BORRADOR") {
        throw new ErrorHorario("El horario vigente es histórico. Crea una nueva versión para editarlo.");
      }

      const eliminadaEn = new Date();
      await tx.bloqueHorario.update({
        where: { id: actual.id },
        data: { eliminadaEn, eliminadaPorId: user.id },
      });
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "ELIMINAR",
          entidad: "BloqueHorario",
          entidadId: actual.id,
          antes: {
            asignaturaId: actual.asignaturaId,
            cursoId: actual.asignatura.cursoId,
            dia: actual.dia,
            horaInicio: actual.horaInicio,
            horaFin: actual.horaFin,
          },
          despues: {
            eliminadaEn: eliminadaEn.toISOString(),
            eliminadaPorId: user.id,
          },
        },
        tx
      );
    });
    revalidarHorario();
    return { ok: true };
  } catch (error) {
    return errorResultado(error);
  }
}

const schemaNuevaVersion = z.object({
  cursoId: z.string().min(1),
  vigenteDesde: z.string().refine(esFechaISOValida, "Fecha inválida"),
});

export async function crearVersionHorario(input: unknown): Promise<Resultado<{ versionId: string }>> {
  const parsed = schemaNuevaVersion.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Selecciona una fecha de vigencia válida." };
  const { user } = await requerirSesion();
  try {
    exigirGestion(user.rol);
    const versionId = await transaccionSerializable(async (tx) => {
      const curso = await tx.curso.findFirst({ where: { id: parsed.data.cursoId, colegioId: user.colegioId }, select: { id: true, anioEscolar: { select: { anio: true } } } });
      if (!curso) throw new ErrorHorario("Curso no encontrado.");
      if (Number(parsed.data.vigenteDesde.slice(0, 4)) !== curso.anioEscolar.anio) {
        throw new ErrorHorario("La vigencia debe pertenecer al año escolar del curso.");
      }
      if (parsed.data.vigenteDesde <= hoyEnSantiago()) {
        throw new ErrorHorario("La nueva versión debe iniciar, como mínimo, el día siguiente.");
      }
      let horario = await tx.horarioCurso.findUnique({ where: { colegioId_cursoId: { colegioId: user.colegioId, cursoId: curso.id } }, select: { id: true } });
      if (!horario) horario = await tx.horarioCurso.create({ data: { colegioId: user.colegioId, cursoId: curso.id }, select: { id: true } });
      const borrador = await tx.horarioVersion.findFirst({ where: { colegioId: user.colegioId, horarioCursoId: horario.id, estado: "BORRADOR" }, select: { id: true } });
      if (borrador) return borrador.id;
      const [maxima, origen] = await Promise.all([
        tx.horarioVersion.aggregate({ where: { colegioId: user.colegioId, horarioCursoId: horario.id }, _max: { numero: true } }),
        tx.horarioVersion.findFirst({ where: { colegioId: user.colegioId, horarioCursoId: horario.id, estado: "PUBLICADO" }, orderBy: { vigenteDesde: "desc" }, select: { id: true, bloques: { where: { eliminadaEn: null }, select: { asignaturaId: true, dia: true, horaInicio: true, horaFin: true, horaInicioMin: true, horaFinMin: true } } } }),
      ]);
      const nueva = await tx.horarioVersion.create({
        data: { colegioId: user.colegioId, horarioCursoId: horario.id, numero: (maxima._max.numero ?? 0) + 1, vigenteDesde: fechaDesdeISO(parsed.data.vigenteDesde), creadoPorId: user.id },
        select: { id: true, numero: true },
      });
      if (origen?.bloques.length) await tx.bloqueHorario.createMany({ data: origen.bloques.map((b) => ({ ...b, colegioId: user.colegioId, horarioVersionId: nueva.id })) });
      await registrarAuditoria({ colegioId: user.colegioId, usuarioId: user.id, accion: "CREAR", entidad: "HorarioVersion", entidadId: nueva.id, despues: { cursoId: curso.id, numero: nueva.numero, vigenteDesde: parsed.data.vigenteDesde, bloquesCopiados: origen?.bloques.length ?? 0 } }, tx);
      return nueva.id;
    });
    revalidarHorario();
    return { ok: true, versionId };
  } catch (error) { return errorResultado(error); }
}

export async function publicarVersionHorario(versionId: string): Promise<ResultadoSimple> {
  const { user } = await requerirSesion();
  try {
    exigirGestion(user.rol);
    await transaccionSerializable(async (tx) => {
      const version = await tx.horarioVersion.findFirst({ where: { id: versionId, colegioId: user.colegioId, estado: "BORRADOR" }, select: { id: true, horarioCursoId: true, vigenteDesde: true, numero: true, horarioCurso: { select: { curso: { select: { anioEscolar: { select: { anio: true } } } } } }, _count: { select: { bloques: { where: { eliminadaEn: null } } } } } });
      if (!version) throw new ErrorHorario("Versión no encontrada o ya publicada.");
      if (version._count.bloques === 0) throw new ErrorHorario("Agrega al menos un bloque antes de publicar.");
      const vigenteDesdeIso = version.vigenteDesde.toISOString().slice(0, 10);
      if (version.vigenteDesde.getUTCFullYear() !== version.horarioCurso.curso.anioEscolar.anio) throw new ErrorHorario("La vigencia no pertenece al año escolar del curso.");
      if (vigenteDesdeIso <= hoyEnSantiago()) throw new ErrorHorario("La versión debe comenzar, como mínimo, el día siguiente.");
      const anterior = await tx.horarioVersion.findFirst({ where: { colegioId: user.colegioId, horarioCursoId: version.horarioCursoId, estado: "PUBLICADO", vigenteDesde: { lt: version.vigenteDesde } }, orderBy: { vigenteDesde: "desc" }, select: { id: true, vigenteHasta: true } });
      if (anterior) {
        const vigenteHasta = new Date(version.vigenteDesde.getTime() - 86_400_000);
        await tx.horarioVersion.update({ where: { id: anterior.id }, data: { vigenteHasta } });
        await registrarAuditoria({ colegioId: user.colegioId, usuarioId: user.id, accion: "MODIFICAR", entidad: "HorarioVersion", entidadId: anterior.id, antes: { vigenteHasta: anterior.vigenteHasta?.toISOString().slice(0, 10) ?? null }, despues: { vigenteHasta: vigenteHasta.toISOString().slice(0, 10), causa: "NUEVA_VERSION_PUBLICADA" } }, tx);
      }
      await tx.horarioVersion.update({ where: { id: version.id }, data: { estado: "PUBLICADO", publicadoEn: new Date(), publicadoPorId: user.id } });
      await registrarAuditoria({ colegioId: user.colegioId, usuarioId: user.id, accion: "MODIFICAR", entidad: "HorarioVersion", entidadId: version.id, antes: { estado: "BORRADOR" }, despues: { estado: "PUBLICADO", numero: version.numero, vigenteDesde: version.vigenteDesde.toISOString().slice(0, 10) } }, tx);
    });
    revalidarHorario();
    return { ok: true };
  } catch (error) { return errorResultado(error); }
}
