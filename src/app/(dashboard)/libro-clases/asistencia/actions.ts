"use server";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  autorizarRegistroAsistencia,
  guardarAsistenciaBloqueSchema,
  guardarAsistenciaSchema,
  UMBRAL_ASISTENCIA,
} from "@/lib/asistencia";
import { esFechaFutura, fechaDesdeISO, hoyEnSantiago, formatearFechaLarga } from "@/lib/fecha";
import { notificarApoderadosDeEstudiante } from "@/lib/notificaciones";
import { esFeriado } from "@/lib/feriados";

export type ResultadoGuardar =
  | { ok: true; creados: number; modificados: number; version: string; versionDiaria?: string }
  | { ok: false; error: string; conflicto?: boolean };

class ConflictoAsistencia extends Error {}
class ErrorAsistencia extends Error {}

function hashOperacion(input: {
  cursoId: string;
  fecha: string;
  marcas: Array<{ estudianteId: string; estado: string }>;
}) {
  const canonico = {
    cursoId: input.cursoId,
    fecha: input.fecha,
    marcas: [...input.marcas].sort((a, b) =>
      a.estudianteId.localeCompare(b.estudianteId)
    ),
  };
  return createHash("sha256").update(JSON.stringify(canonico)).digest("hex");
}

function hashOperacionBloque(input: {
  cursoId: string;
  bloqueHorarioId: string;
  fecha: string;
  marcas: Array<{ estudianteId: string; estado: string }>;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        cursoId: input.cursoId,
        bloqueHorarioId: input.bloqueHorarioId,
        fecha: input.fecha,
        marcas: [...input.marcas].sort((a, b) =>
          a.estudianteId.localeCompare(b.estudianteId)
        ),
      })
    )
    .digest("hex");
}

/**
 * Guarda (crea o corrige) la asistencia diaria de un curso para una fecha.
 * Cada creación y cada modificación queda registrada en audit_log (Circular
 * N°30) dentro de la misma transacción. Nada se borra físicamente.
 */
export async function guardarAsistencia(
  input: unknown
): Promise<ResultadoGuardar> {
  const { user } = await requerirSesion();

  const parsed = guardarAsistenciaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos." };
  }
  const {
    cursoId,
    fecha,
    marcas,
    clientMutationId,
    versionBase,
  } = parsed.data;

  // No se registra asistencia de un día que aún no ocurre (día calendario chileno).
  if (esFechaFutura(fecha, hoyEnSantiago())) {
    return {
      ok: false,
      error: "No se puede registrar asistencia de una fecha futura.",
    };
  }
  const fechaDate = fechaDesdeISO(fecha);
  if (esFeriado(fecha)) {
    return { ok: false, error: "La fecha corresponde a un feriado legal sin jornada escolar." };
  }

  // El curso debe pertenecer al colegio de la sesión (regla multi-tenant).
  // Traemos también lo necesario para autorizar y validar pertenencia.
  const curso = await prisma.curso.findFirst({
    where: { id: cursoId, colegioId: user.colegioId },
    select: {
      id: true,
      profesorJefeId: true,
      asignaturas: { select: { docenteId: true } },
      matriculas: {
        where: {
          colegioId: user.colegioId,
          fecha: { lte: fechaDate },
          OR: [{ retiradaEn: null }, { retiradaEn: { gte: fechaDate } }],
        },
        select: { estudianteId: true },
      },
      anioEscolar: { select: { anio: true } },
    },
  });
  if (!curso) return { ok: false, error: "Curso no encontrado." };

  const docenteIds = curso.asignaturas
    .map((a) => a.docenteId)
    .filter((id): id is string => Boolean(id));

  // Autorización server-side: rol + pertenencia al curso (nunca solo en la UI).
  if (
    !autorizarRegistroAsistencia(user.rol, user.id, {
      profesorJefeId: curso.profesorJefeId,
      docenteIds,
    })
  ) {
    return {
      ok: false,
      error: "No tienes permiso para registrar la asistencia de este curso.",
    };
  }

  // Solo estudiantes con matrícula ACTIVA en este curso: descarta ids ajenos o
  // matrículas de otro colegio aunque vengan en la solicitud.
  const permitidos = new Set(curso.matriculas.map((m) => m.estudianteId));
  const marcasValidas = marcas.filter((m) => permitidos.has(m.estudianteId));
  if (
    marcasValidas.length !== marcas.length ||
    new Set(marcas.map((marca) => marca.estudianteId)).size !== marcas.length ||
    marcasValidas.length !== permitidos.size
  ) {
    return { ok: false, error: "La nómina debe incluir una marca única para cada estudiante activo del curso." };
  }

  if (fechaDate.getUTCFullYear() !== curso.anioEscolar.anio) {
    return { ok: false, error: "La fecha no pertenece al año escolar del curso." };
  }
  const diaSemana = fechaDate.getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) {
    return { ok: false, error: "La fecha no corresponde a una jornada lectiva configurada." };
  }

  let creados = 0;
  let modificados = 0;
  let versionResultado = "";
  const nuevasInasistencias: string[] = [];
  const payloadHash = hashOperacion({ cursoId, fecha, marcas: marcasValidas });

  // Una misma operación del dispositivo solo puede aplicarse una vez. Si la
  // clave se reutiliza con otro contenido, se informa un conflicto explícito.
  if (clientMutationId) {
    const operacion = await prisma.operacionIdempotente.findUnique({
      where: {
        colegioId_membresiaId_clave: {
          colegioId: user.colegioId,
          membresiaId: user.membresiaId,
          clave: clientMutationId,
        },
      },
      select: { payloadHash: true, estado: true, resultadoMinimo: true },
    });
    if (operacion?.payloadHash !== undefined && operacion.payloadHash !== payloadHash) {
      return {
        ok: false,
        conflicto: true,
        error: "La operación ya fue usada con otros datos. Revisa la asistencia antes de continuar.",
      };
    }
    if (operacion?.estado === "APLICADA" && operacion.resultadoMinimo) {
      const resultado = operacion.resultadoMinimo as {
        creados: number;
        modificados: number;
        version: string;
      };
      return { ok: true, ...resultado };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const [bloqueLectivo, suspension] = await Promise.all([
        tx.bloqueHorario.findFirst({
          where: {
            colegioId: user.colegioId,
            eliminadaEn: null,
            dia: diaSemana,
            asignatura: { colegioId: user.colegioId, cursoId },
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
            OR: [{ cursoId: null }, { cursoId }],
          },
          select: { id: true },
        }),
      ]);
      if (!bloqueLectivo || suspension) {
        throw new ErrorAsistencia("La fecha no corresponde a una jornada lectiva activa para el curso.");
      }

      if (clientMutationId) {
        await tx.operacionIdempotente.create({
          data: {
            colegioId: user.colegioId,
            membresiaId: user.membresiaId,
            clave: clientMutationId,
            tipo: "ASISTENCIA_DIARIA",
            payloadHash,
            expiraEn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }

      // La lectura y las escrituras pertenecen a la misma transacción serializable:
      // una corrección concurrente no puede quedar sobrescrita con un "antes" obsoleto.
      const existentes = await tx.asistenciaDiaria.findMany({
        where: {
          colegioId: user.colegioId,
          fecha: fechaDate,
          estudianteId: { in: [...permitidos] },
        },
        select: { id: true, estudianteId: true, estado: true, actualizadoEn: true },
      });
      if (
        existentes.some((registro) => registro.actualizadoEn > new Date(versionBase))
      ) {
        throw new ConflictoAsistencia(
          "Otra persona actualizó esta asistencia. Recarga y revisa antes de reemplazarla."
        );
      }
      const previoPorEstudiante = new Map(
        existentes.map((registro) => [registro.estudianteId, registro])
      );

      for (const marca of marcasValidas) {
        const previo = previoPorEstudiante.get(marca.estudianteId);
        // Aviso al apoderado solo cuando el pupilo PASA a ausente (no en cada guardado).
        if (marca.estado === "AUSENTE" && previo?.estado !== "AUSENTE") {
          nuevasInasistencias.push(marca.estudianteId);
        }

        if (!previo) {
          // upsert (no create) por si dos guardados optimistas se solapan y
          // ambos leyeron "sin registro": evita violar @@unique([estudianteId, fecha]).
          const guardado = await tx.asistenciaDiaria.upsert({
            where: {
              estudianteId_fecha: {
                estudianteId: marca.estudianteId,
                fecha: fechaDate,
              },
            },
            create: {
              colegioId: user.colegioId,
              estudianteId: marca.estudianteId,
              fecha: fechaDate,
              estado: marca.estado,
              registradoPorId: user.id,
              fuenteBloqueId: null,
            },
            update: { estado: marca.estado, registradoPorId: user.id, fuenteBloqueId: null },
            select: { id: true },
          });
          await registrarAuditoria(
            {
              colegioId: user.colegioId,
              usuarioId: user.id,
              accion: "CREAR",
              entidad: "AsistenciaDiaria",
              entidadId: guardado.id,
              despues: { estado: marca.estado }, // sin datos personales del menor
            },
            tx
          );
          creados++;
        } else if (previo.estado !== marca.estado) {
          await tx.asistenciaDiaria.update({
            where: { id: previo.id },
            data: { estado: marca.estado, registradoPorId: user.id, fuenteBloqueId: null },
          });
          await registrarAuditoria(
            {
              colegioId: user.colegioId,
              usuarioId: user.id,
              accion: "MODIFICAR",
              entidad: "AsistenciaDiaria",
              entidadId: previo.id,
              antes: { estado: previo.estado },
              despues: { estado: marca.estado },
            },
            tx
          );
          modificados++;

          if (previo.estado === "AUSENTE" && marca.estado !== "AUSENTE") {
            const justificaciones = await tx.justificacionInasistencia.findMany({
              where: {
                colegioId: user.colegioId,
                estudianteId: marca.estudianteId,
                fecha: fechaDate,
                estado: { not: "ANULADA" },
              },
              select: { id: true, estado: true },
            });
            for (const justificacion of justificaciones) {
              const anuladaEn = new Date();
              const anuladas = await tx.justificacionInasistencia.updateMany({
                where: { id: justificacion.id, colegioId: user.colegioId, estado: justificacion.estado },
                data: { estado: "ANULADA", anuladaPorId: user.id, anuladaEn },
              });
              if (anuladas.count !== 1) throw new ConflictoAsistencia("La justificación cambió mientras se corregía la asistencia.");
              await tx.eventoJustificacion.create({
                data: {
                  colegioId: user.colegioId,
                  justificacionId: justificacion.id,
                  estadoAnterior: justificacion.estado,
                  estadoNuevo: "ANULADA",
                  actorId: user.id,
                },
              });
              await registrarAuditoria(
                {
                  colegioId: user.colegioId,
                  usuarioId: user.id,
                  accion: "MODIFICAR",
                  entidad: "JustificacionInasistencia",
                  entidadId: justificacion.id,
                  antes: { estado: justificacion.estado },
                  despues: { estado: "ANULADA", causa: "ASISTENCIA_CORREGIDA" },
                },
                tx
              );
            }
          }
        }
        // Si el estado no cambió, no se escribe nada: evita ruido en el audit_log.
      }

      versionResultado = new Date().toISOString();

      if (clientMutationId) {
        await tx.operacionIdempotente.update({
          where: {
            colegioId_membresiaId_clave: {
              colegioId: user.colegioId,
              membresiaId: user.membresiaId,
              clave: clientMutationId,
            },
          },
          data: {
            estado: "APLICADA",
            procesadaEn: new Date(),
            resultadoMinimo: {
              creados,
              modificados,
              version: versionResultado,
            },
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ErrorAsistencia) {
      return { ok: false, error: error.message };
    }
    if (error instanceof ConflictoAsistencia) {
      return { ok: false, conflicto: true, error: error.message };
    }
    if (
      clientMutationId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const operacion = await prisma.operacionIdempotente.findUnique({
        where: {
          colegioId_membresiaId_clave: {
            colegioId: user.colegioId,
            membresiaId: user.membresiaId,
            clave: clientMutationId,
          },
        },
        select: { payloadHash: true, estado: true, resultadoMinimo: true },
      });
      if (operacion?.payloadHash !== payloadHash) {
        return { ok: false, conflicto: true, error: "La operación entró en conflicto con otro guardado." };
      }
      if (operacion?.estado === "APLICADA" && operacion.resultadoMinimo) {
        const resultado = operacion.resultadoMinimo as {
          creados: number;
          modificados: number;
          version: string;
        };
        return { ok: true, ...resultado };
      }
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return {
        ok: false,
        conflicto: true,
        error: "Otra persona actualizó esta asistencia. Recarga y revisa antes de continuar.",
      };
    }
    // No exponer detalles internos; la UI muestra "reintenta".
    return { ok: false, error: "No se pudo guardar la asistencia. Reintenta." };
  }

  // Aviso a apoderados de las nuevas inasistencias (best-effort, fuera de la
  // transacción). Push + fallback email; respeta el flag del colegio.
  if (nuevasInasistencias.length > 0) {
    const fechaTexto = formatearFechaLarga(fecha);
    for (const estudianteId of nuevasInasistencias) {
      await notificarApoderadosDeEstudiante(user.colegioId, estudianteId, {
        tipo: "GENERAL",
        titulo: "Inasistencia registrada",
        cuerpo: `Tu pupilo fue registrado como ausente el ${fechaTexto}.`,
        enlace: `/mi-pupilo/${estudianteId}`,
      });

      // Alerta de asistencia crítica (Decreto 67): si con la inasistencia de hoy
      // el estudiante CRUZA el umbral del 85%, se avisa UNA sola vez (solo en el
      // cruce, no en cada ausencia posterior). Best-effort, sin datos sensibles.
      try {
        const marcas = await prisma.asistenciaDiaria.groupBy({
          by: ["estado"],
          where: { colegioId: user.colegioId, estudianteId },
          _count: { _all: true },
        });
        const total = marcas.reduce((s, m) => s + m._count._all, 0);
        const ausentes = marcas.find((m) => m.estado === "AUSENTE")?._count._all ?? 0;
        // Con pocos días de registro el porcentaje aún no es significativo.
        if (total >= 20 && ausentes > 0) {
          const presentes = total - ausentes;
          const pctAhora = (presentes / total) * 100;
          const pctAntes = (presentes / (total - 1)) * 100;
          if (pctAntes >= UMBRAL_ASISTENCIA && pctAhora < UMBRAL_ASISTENCIA) {
            await notificarApoderadosDeEstudiante(user.colegioId, estudianteId, {
              tipo: "GENERAL",
              titulo: "Asistencia bajo el mínimo de promoción",
              cuerpo: `La asistencia acumulada de tu pupilo quedó bajo el ${UMBRAL_ASISTENCIA}% requerido para la promoción escolar. Te sugerimos justificar las inasistencias y coordinar con el colegio.`,
              enlace: `/mi-pupilo/${estudianteId}`,
            });
          }
        }
      } catch {
        // La alerta es accesoria: nunca bloquea el guardado de la lista.
      }
    }
  }

  revalidatePath("/libro-clases/asistencia");
  revalidatePath("/libro-clases/asistencia/mensual");
  return { ok: true, creados, modificados, version: versionResultado };
}

/**
 * Guarda la asistencia de una clase/bloque. La evidencia queda en
 * AsistenciaBloque. Solo cuando el bloque representa la segunda hora
 * pedagógica del curso se concilia, en la misma transacción, AsistenciaDiaria.
 */
export async function guardarAsistenciaBloque(
  input: unknown
): Promise<ResultadoGuardar> {
  const { user } = await requerirSesion();
  const parsed = guardarAsistenciaBloqueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const {
    cursoId,
    bloqueHorarioId,
    fecha,
    marcas,
    clientMutationId,
    capturadaEn,
    versionBase,
    versionDiariaBase,
  } = parsed.data;
  if (esFechaFutura(fecha, hoyEnSantiago())) {
    return { ok: false, error: "No se puede registrar asistencia de una fecha futura." };
  }
  if (esFeriado(fecha)) {
    return { ok: false, error: "La fecha corresponde a un feriado legal sin jornada escolar." };
  }

  const fechaDate = fechaDesdeISO(fecha);
  const diaSemana = fechaDate.getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) {
    return { ok: false, error: "La fecha no corresponde a una jornada lectiva configurada." };
  }

  const bloque = await prisma.bloqueHorario.findFirst({
    where: {
      id: bloqueHorarioId,
      colegioId: user.colegioId,
      dia: diaSemana,
      eliminadaEn: null,
      horarioVersion: {
        estado: "PUBLICADO",
        vigenteDesde: { lte: fechaDate },
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaDate } }],
      },
      asignatura: { colegioId: user.colegioId, cursoId },
    },
    select: {
      id: true,
      horaInicioMin: true,
      horaFinMin: true,
      asignatura: {
        select: {
          docenteId: true,
          curso: {
            select: {
              profesorJefeId: true,
              anioEscolar: { select: { anio: true } },
              matriculas: {
                where: {
                  colegioId: user.colegioId,
                  fecha: { lte: fechaDate },
                  OR: [{ retiradaEn: null }, { retiradaEn: { gte: fechaDate } }],
                },
                select: { estudianteId: true },
              },
            },
          },
        },
      },
    },
  });
  if (!bloque) return { ok: false, error: "La clase no pertenece al horario vigente." };
  if (fechaDate.getUTCFullYear() !== bloque.asignatura.curso.anioEscolar.anio) {
    return { ok: false, error: "La fecha no pertenece al año escolar del curso." };
  }

  const rolesQueImparten = new Set(["PROFESOR", "PROFESOR_JEFE", "PIE"]);
  const esDocenteDelBloque =
    rolesQueImparten.has(user.rol) && bloque.asignatura.docenteId === user.id;
  if (!esDocenteDelBloque) {
    return { ok: false, error: "Solo el docente de esta clase puede registrar su asistencia." };
  }

  const permitidos = new Set(
    bloque.asignatura.curso.matriculas.map((matricula) => matricula.estudianteId)
  );
  const marcasValidas = marcas.filter((marca) => permitidos.has(marca.estudianteId));
  if (
    marcasValidas.length !== marcas.length ||
    new Set(marcas.map((marca) => marca.estudianteId)).size !== marcas.length ||
    marcasValidas.length !== permitidos.size
  ) {
    return { ok: false, error: "La nómina debe incluir una marca única para cada estudiante activo del curso." };
  }

  const bloquesDelDia = await prisma.bloqueHorario.findMany({
    where: {
      colegioId: user.colegioId,
      dia: diaSemana,
      eliminadaEn: null,
      asignatura: { colegioId: user.colegioId, cursoId },
      horarioVersion: {
        estado: "PUBLICADO",
        vigenteDesde: { lte: fechaDate },
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaDate } }],
      },
    },
    select: { id: true, horaInicioMin: true, horaFinMin: true },
    orderBy: [{ horaInicioMin: "asc" }, { horaFinMin: "asc" }],
  });
  const horasUnicas = [...new Map(
    bloquesDelDia.map((item) => [`${item.horaInicioMin}:${item.horaFinMin}`, item])
  ).values()];
  const claveSeleccionada = `${bloque.horaInicioMin}:${bloque.horaFinMin}`;
  const esSegundaHora = horasUnicas[1]
    ? `${horasUnicas[1].horaInicioMin}:${horasUnicas[1].horaFinMin}` === claveSeleccionada
    : false;
  if (esSegundaHora && !versionDiariaBase) {
    return { ok: false, error: "Falta la versión del control diario para conciliar la segunda hora." };
  }

  const payloadHash = hashOperacionBloque({
    cursoId,
    bloqueHorarioId,
    fecha,
    marcas: marcasValidas,
  });
  if (clientMutationId) {
    const operacion = await prisma.operacionIdempotente.findUnique({
      where: {
        colegioId_membresiaId_clave: {
          colegioId: user.colegioId,
          membresiaId: user.membresiaId,
          clave: clientMutationId,
        },
      },
      select: { payloadHash: true, estado: true, resultadoMinimo: true },
    });
    if (operacion?.payloadHash !== undefined && operacion.payloadHash !== payloadHash) {
      return { ok: false, conflicto: true, error: "La operación ya fue usada con otros datos." };
    }
    if (operacion?.estado === "APLICADA" && operacion.resultadoMinimo) {
      return { ok: true, ...(operacion.resultadoMinimo as { creados: number; modificados: number; version: string; versionDiaria?: string }) };
    }
  }

  let creados = 0;
  let modificados = 0;
  let versionResultado = "";
  const nuevasInasistencias: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const [bloqueVigente, suspension] = await Promise.all([
        tx.bloqueHorario.findFirst({
          where: {
            id: bloqueHorarioId,
            colegioId: user.colegioId,
            dia: diaSemana,
            eliminadaEn: null,
            asignatura: { colegioId: user.colegioId, cursoId },
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
            OR: [{ cursoId: null }, { cursoId }],
          },
          select: { id: true },
        }),
      ]);
      if (!bloqueVigente || suspension) {
        throw new ErrorAsistencia("La clase no está activa en esta jornada lectiva.");
      }

      if (clientMutationId) {
        await tx.operacionIdempotente.create({
          data: {
            colegioId: user.colegioId,
            membresiaId: user.membresiaId,
            clave: clientMutationId,
            tipo: "ASISTENCIA_BLOQUE",
            payloadHash,
            expiraEn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }

      const existentes = await tx.asistenciaBloque.findMany({
        where: {
          colegioId: user.colegioId,
          bloqueHorarioId,
          fecha: fechaDate,
          estudianteId: { in: [...permitidos] },
        },
        select: { id: true, estudianteId: true, estado: true, actualizadaEn: true },
      });
      if (existentes.some((registro) => registro.actualizadaEn > new Date(versionBase))) {
        throw new ConflictoAsistencia("Otra persona actualizó esta clase. Recarga y revisa antes de reemplazarla.");
      }
      const previoBloque = new Map(existentes.map((registro) => [registro.estudianteId, registro]));

      const diarios = esSegundaHora
        ? await tx.asistenciaDiaria.findMany({
            where: {
              colegioId: user.colegioId,
              fecha: fechaDate,
              estudianteId: { in: [...permitidos] },
            },
            select: { id: true, estudianteId: true, estado: true, actualizadoEn: true },
          })
        : [];
      if (
        esSegundaHora &&
        diarios.some((registro) => registro.actualizadoEn > new Date(versionDiariaBase!))
      ) {
        throw new ConflictoAsistencia("El control diario cambió mientras registrabas la segunda hora. Recarga para conciliarlo.");
      }
      const previoDiario = new Map(diarios.map((registro) => [registro.estudianteId, registro]));

      for (const marca of marcasValidas) {
        const anteriorBloque = previoBloque.get(marca.estudianteId);
        if (!anteriorBloque) {
          const creado = await tx.asistenciaBloque.upsert({
            where: {
              colegioId_estudianteId_bloqueHorarioId_fecha: {
                colegioId: user.colegioId,
                estudianteId: marca.estudianteId,
                bloqueHorarioId,
                fecha: fechaDate,
              },
            },
            create: {
              colegioId: user.colegioId,
              estudianteId: marca.estudianteId,
              bloqueHorarioId,
              fecha: fechaDate,
              estado: marca.estado,
              registradoPorId: user.id,
              capturadaEn: capturadaEn ? new Date(capturadaEn) : new Date(),
            },
            update: { estado: marca.estado, registradoPorId: user.id },
            select: { id: true },
          });
          await registrarAuditoria({
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "CREAR",
            entidad: "AsistenciaBloque",
            entidadId: creado.id,
            despues: { bloqueHorarioId, fecha, estado: marca.estado },
          }, tx);
          creados++;
        } else if (anteriorBloque.estado !== marca.estado) {
          await tx.asistenciaBloque.update({
            where: { id: anteriorBloque.id },
            data: { estado: marca.estado, registradoPorId: user.id },
          });
          await registrarAuditoria({
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "MODIFICAR",
            entidad: "AsistenciaBloque",
            entidadId: anteriorBloque.id,
            antes: { estado: anteriorBloque.estado },
            despues: { estado: marca.estado, bloqueHorarioId, fecha },
          }, tx);
          modificados++;
        }

        if (!esSegundaHora) continue;
        const anteriorDiario = previoDiario.get(marca.estudianteId);
        if (marca.estado === "AUSENTE" && anteriorDiario?.estado !== "AUSENTE") {
          nuevasInasistencias.push(marca.estudianteId);
        }
        if (!anteriorDiario) {
          const diario = await tx.asistenciaDiaria.upsert({
            where: { estudianteId_fecha: { estudianteId: marca.estudianteId, fecha: fechaDate } },
            create: {
              colegioId: user.colegioId,
              estudianteId: marca.estudianteId,
              fecha: fechaDate,
              estado: marca.estado,
              registradoPorId: user.id,
              fuenteBloqueId: bloqueHorarioId,
            },
            update: {
              estado: marca.estado,
              registradoPorId: user.id,
              fuenteBloqueId: bloqueHorarioId,
            },
            select: { id: true },
          });
          await registrarAuditoria({
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "CREAR",
            entidad: "AsistenciaDiaria",
            entidadId: diario.id,
            despues: { estado: marca.estado, origen: "SEGUNDA_HORA", bloqueHorarioId },
          }, tx);
        } else if (anteriorDiario.estado !== marca.estado) {
          await tx.asistenciaDiaria.update({
            where: { id: anteriorDiario.id },
            data: {
              estado: marca.estado,
              registradoPorId: user.id,
              fuenteBloqueId: bloqueHorarioId,
            },
          });
          await registrarAuditoria({
            colegioId: user.colegioId,
            usuarioId: user.id,
            accion: "MODIFICAR",
            entidad: "AsistenciaDiaria",
            entidadId: anteriorDiario.id,
            antes: { estado: anteriorDiario.estado },
            despues: { estado: marca.estado, origen: "SEGUNDA_HORA", bloqueHorarioId },
          }, tx);

          if (anteriorDiario.estado === "AUSENTE" && marca.estado !== "AUSENTE") {
            const justificaciones = await tx.justificacionInasistencia.findMany({
              where: {
                colegioId: user.colegioId,
                estudianteId: marca.estudianteId,
                fecha: fechaDate,
                estado: { not: "ANULADA" },
              },
              select: { id: true, estado: true },
            });
            for (const justificacion of justificaciones) {
              const anuladas = await tx.justificacionInasistencia.updateMany({
                where: {
                  id: justificacion.id,
                  colegioId: user.colegioId,
                  estado: justificacion.estado,
                },
                data: { estado: "ANULADA", anuladaPorId: user.id, anuladaEn: new Date() },
              });
              if (anuladas.count !== 1) {
                throw new ConflictoAsistencia("La justificación cambió durante la conciliación.");
              }
              await tx.eventoJustificacion.create({
                data: {
                  colegioId: user.colegioId,
                  justificacionId: justificacion.id,
                  estadoAnterior: justificacion.estado,
                  estadoNuevo: "ANULADA",
                  actorId: user.id,
                },
              });
              await registrarAuditoria({
                colegioId: user.colegioId,
                usuarioId: user.id,
                accion: "MODIFICAR",
                entidad: "JustificacionInasistencia",
                entidadId: justificacion.id,
                antes: { estado: justificacion.estado },
                despues: { estado: "ANULADA", causa: "SEGUNDA_HORA_CORREGIDA" },
              }, tx);
            }
          }
        }
      }

      versionResultado = new Date().toISOString();
      if (clientMutationId) {
        await tx.operacionIdempotente.update({
          where: {
            colegioId_membresiaId_clave: {
              colegioId: user.colegioId,
              membresiaId: user.membresiaId,
              clave: clientMutationId,
            },
          },
          data: {
            estado: "APLICADA",
            procesadaEn: new Date(),
            resultadoMinimo: {
              creados,
              modificados,
              version: versionResultado,
              versionDiaria: esSegundaHora ? versionResultado : undefined,
            },
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ErrorAsistencia || error instanceof ConflictoAsistencia) {
      return {
        ok: false,
        conflicto: error instanceof ConflictoAsistencia || undefined,
        error: error.message,
      };
    }
    if (
      clientMutationId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const operacion = await prisma.operacionIdempotente.findUnique({
        where: {
          colegioId_membresiaId_clave: {
            colegioId: user.colegioId,
            membresiaId: user.membresiaId,
            clave: clientMutationId,
          },
        },
        select: { payloadHash: true, estado: true, resultadoMinimo: true },
      });
      if (operacion?.payloadHash === payloadHash && operacion.estado === "APLICADA" && operacion.resultadoMinimo) {
        return { ok: true, ...(operacion.resultadoMinimo as { creados: number; modificados: number; version: string; versionDiaria?: string }) };
      }
      return { ok: false, conflicto: true, error: "La operación entró en conflicto con otro guardado." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { ok: false, conflicto: true, error: "Otra persona actualizó esta asistencia. Recarga y revisa." };
    }
    return { ok: false, error: "No se pudo guardar la asistencia de la clase. Reintenta." };
  }

  if (nuevasInasistencias.length > 0) {
    const fechaTexto = formatearFechaLarga(fecha);
    for (const estudianteId of nuevasInasistencias) {
      await notificarApoderadosDeEstudiante(user.colegioId, estudianteId, {
        tipo: "GENERAL",
        titulo: "Inasistencia registrada",
        cuerpo: `Tu pupilo fue registrado como ausente en el control diario del ${fechaTexto}.`,
        enlace: `/mi-pupilo/${estudianteId}`,
      });
    }
  }

  revalidatePath("/libro-clases/asistencia");
  revalidatePath("/libro-clases/asistencia/mensual");
  return {
    ok: true,
    creados,
    modificados,
    version: versionResultado,
    versionDiaria: esSegundaHora ? versionResultado : undefined,
  };
}
