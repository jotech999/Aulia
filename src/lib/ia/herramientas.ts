import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { calcularResumen, type EstadoAsistencia } from "@/lib/asistencia";
import {
  calcularPromedio,
  promedioGeneral,
  NOTA_APROBACION,
  type ItemPromedio,
} from "@/lib/calificaciones";
import { evaluarRiesgo, ordenPorRiesgo } from "@/lib/riesgo";
import {
  alcanceCursos,
  alcanceCursosRiesgo,
  alcanceEstudiantes,
  type UsuarioIA,
} from "./alcance";
import { nombreCurso } from "@/lib/cursos";

/**
 * Herramientas del asistente de IA. TODAS son de solo lectura, reautorizan el
 * alcance del usuario en el servidor y devuelven campos con lista blanca
 * explícita: nunca `fichaSalud`, `rut`, fecha de nacimiento, contacto ni datos
 * de convivencia (validado con `experto-normativa`).
 *
 * `ejecutarHerramienta` devuelve el resultado para el modelo y, cuando accede a
 * datos de estudiantes, metadatos de auditoría (sin PII) para `audit_log`.
 */

export type Auditable = {
  entidad: string;
  entidadId: string;
  meta: Record<string, unknown>;
};

export type ResultadoHerramienta = {
  salida: unknown;
  auditar?: Auditable;
};


/** Resuelve un curso por nivel+letra dentro del alcance del usuario (año más reciente). */
async function resolverCurso(
  user: UsuarioIA,
  nivel: string,
  letra: string,
  scope = alcanceCursos(user)
) {
  return prisma.curso.findFirst({
    where: { AND: [scope, { nivel, letra }] },
    select: { id: true, nivel: true, letra: true },
    orderBy: { anioEscolar: { anio: "desc" } },
  });
}

// ── Definiciones expuestas al modelo ──────────────────────────────────────

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "listar_cursos",
    description:
      "Lista los cursos que el usuario puede consultar (nivel y letra). Úsala para saber qué cursos existen antes de pedir un resumen o alertas.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "buscar_estudiantes",
    description:
      "Busca estudiantes por nombre o apellido dentro del alcance del usuario. Devuelve nombre y curso. Úsala cuando el usuario menciona a un estudiante por su nombre.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Texto a buscar en nombre o apellido." },
      },
      required: ["consulta"],
    },
  },
  {
    name: "resumen_asistencia_curso",
    description:
      "Resumen AGREGADO de asistencia de un curso (porcentaje, presentes, ausentes, días con registro). No incluye nombres. Úsala para preguntas sobre asistencia de un curso.",
    input_schema: {
      type: "object",
      properties: {
        nivel: { type: "string", description: "Nivel del curso, p. ej. 8B, 1M." },
        letra: { type: "string", description: "Letra del curso, p. ej. A." },
      },
      required: ["nivel", "letra"],
    },
  },
  {
    name: "alertas_curso",
    description:
      "Estudiantes de un curso con riesgo de repitencia/deserción (asistencia, notas, anotaciones). Solo disponible para gestión y profesor jefe. Incluye nombre y nivel de riesgo.",
    input_schema: {
      type: "object",
      properties: {
        nivel: { type: "string" },
        letra: { type: "string" },
      },
      required: ["nivel", "letra"],
    },
  },
  {
    name: "estudiantes_de_curso",
    description:
      "Lista los estudiantes con matrícula activa de un curso (nombre). Úsala para saber quiénes componen un curso dentro del alcance del usuario.",
    input_schema: {
      type: "object",
      properties: {
        nivel: { type: "string" },
        letra: { type: "string" },
      },
      required: ["nivel", "letra"],
    },
  },
  {
    name: "horario_hoy",
    description:
      "El horario de HOY del usuario docente: sus bloques de clase con hora de inicio/fin, asignatura, curso y estado (dictada, en curso o próxima, según la hora actual de Chile). Úsala cuando pregunten qué clases tienen hoy, cuál es la próxima clase o a qué hora les toca un curso. Solo para quienes dictan clases.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "pendientes_operativos",
    description:
      "Pendientes del libro de clases: clases dictadas sin firmar, cursos sin lista pasada hoy y evaluaciones vencidas sin notas. Para docentes muestra SUS pendientes; para dirección/UTP/inspectoría, los del colegio. Úsala cuando pregunten qué falta, qué está pendiente o cómo viene el cierre.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "proximas_evaluaciones",
    description:
      "Las próximas evaluaciones agendadas (nombre, asignatura, curso y fecha). Para el apoderado: solo las de los cursos de sus pupilos. Para docentes: las de sus cursos. Úsala cuando pregunten cuándo es la próxima prueba, qué evaluaciones vienen o qué hay agendado.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "comunicados_pendientes",
    description:
      "SOLO PARA APODERADOS: los comunicados del colegio que aún no han leído (título y fecha) y cuántos son. Úsala cuando un apoderado pregunte qué comunicados tiene, si hay avisos nuevos o qué le ha enviado el colegio.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "promedios_estudiante",
    description:
      "Promedios por asignatura y promedio general de un estudiante (escala 1.0–7.0). Para apoderados: solo sus pupilos. Requiere el id obtenido de buscar_estudiantes. Úsala cuando pregunten por las notas o promedios de un estudiante.",
    input_schema: {
      type: "object",
      properties: {
        estudianteId: { type: "string", description: "Id del estudiante (de buscar_estudiantes)." },
      },
      required: ["estudianteId"],
    },
  },
  {
    name: "anotaciones_curso",
    description:
      "Resumen AGREGADO de anotaciones de un curso en los últimos 30 días (recuento de positivas y negativas, sin nombres ni textos). Solo para el equipo del colegio. Úsala para preguntas sobre el clima o conducta general de un curso.",
    input_schema: {
      type: "object",
      properties: {
        nivel: { type: "string" },
        letra: { type: "string" },
      },
      required: ["nivel", "letra"],
    },
  },
  {
    name: "mensajes_sin_leer",
    description:
      "Los mensajes directos que el usuario aún no lee: para docentes, mensajes de apoderados de sus estudiantes; para apoderados, respuestas del colegio sobre sus pupilos. Devuelve estudiante, fecha y un extracto. Úsala cuando pregunten si tienen mensajes nuevos o pendientes de responder.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "situacion_final_anio",
    description:
      "Situación final del año escolar de un estudiante (promovido, repite o en análisis) SOLO si la dirección del colegio ya firmó la resolución del cierre de año. Si aún no está resuelta, dilo así: el colegio todavía no ha resuelto. Requiere el id de buscar_estudiantes. Para apoderados: solo sus pupilos.",
    input_schema: {
      type: "object",
      properties: {
        estudianteId: { type: "string", description: "Id del estudiante (de buscar_estudiantes)." },
      },
      required: ["estudianteId"],
    },
  },
  {
    name: "ficha_estudiante",
    description:
      "Ficha académica mínima de un estudiante (curso, % de asistencia, promedio general, nº de anotaciones negativas). No incluye datos de salud, RUT ni contacto. Requiere el id obtenido de buscar_estudiantes.",
    input_schema: {
      type: "object",
      properties: {
        estudianteId: { type: "string", description: "Id del estudiante (de buscar_estudiantes)." },
      },
      required: ["estudianteId"],
    },
  },
];

// ── Ejecución (servidor) ──────────────────────────────────────────────────

export async function ejecutarHerramienta(
  user: UsuarioIA,
  nombre: string,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  switch (nombre) {
    case "listar_cursos":
      return listarCursos(user);
    case "buscar_estudiantes":
      return buscarEstudiantes(user, entrada);
    case "resumen_asistencia_curso":
      return resumenAsistenciaCurso(user, entrada);
    case "alertas_curso":
      return alertasCurso(user, entrada);
    case "estudiantes_de_curso":
      return estudiantesDeCurso(user, entrada);
    case "ficha_estudiante":
      return fichaEstudiante(user, entrada);
    case "pendientes_operativos":
      return pendientesOperativos(user);
    case "horario_hoy":
      return horarioHoy(user);
    case "proximas_evaluaciones":
      return proximasEvaluaciones(user);
    case "comunicados_pendientes":
      return comunicadosPendientes(user);
    case "promedios_estudiante":
      return promediosEstudiante(user, entrada);
    case "anotaciones_curso":
      return anotacionesCurso(user, entrada);
    case "mensajes_sin_leer":
      return mensajesSinLeer(user);
    case "situacion_final_anio":
      return situacionFinalAnio(user, entrada);
    default:
      return { salida: { error: `Herramienta desconocida: ${nombre}` } };
  }
}

async function listarCursos(user: UsuarioIA): Promise<ResultadoHerramienta> {
  const cursos = await prisma.curso.findMany({
    where: alcanceCursos(user),
    select: { nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
    take: 100,
  });
  return { salida: { cursos: cursos.map(nombreCurso) } };
}

async function buscarEstudiantes(
  user: UsuarioIA,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  const { consulta } = z.object({ consulta: z.string().min(1).max(80) }).parse(entrada);
  const términos = consulta.trim().split(/\s+/).slice(0, 4);

  const estudiantes = await prisma.estudiante.findMany({
    where: {
      AND: [
        alcanceEstudiantes(user),
        {
          AND: términos.map((t) => ({
            OR: [
              { nombres: { contains: t, mode: "insensitive" as const } },
              { apellidos: { contains: t, mode: "insensitive" as const } },
            ],
          })),
        },
      ],
    },
    // Lista blanca: sin rut, sin fichaSalud, sin fechaNacimiento.
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { curso: { select: { nivel: true, letra: true } } },
        take: 1,
      },
    },
    take: 15,
  });

  const resultado = estudiantes.map((e) => ({
    id: e.id,
    nombre: `${e.apellidos}, ${e.nombres}`,
    curso: e.matriculas[0] ? nombreCurso(e.matriculas[0].curso) : "sin curso activo",
  }));

  return {
    salida: { estudiantes: resultado, total: resultado.length },
    auditar: {
      entidad: "Estudiante",
      entidadId: resultado.map((r) => r.id).join(",") || "-",
      meta: { herramienta: "buscar_estudiantes", encontrados: resultado.length },
    },
  };
}

async function resumenAsistenciaCurso(
  user: UsuarioIA,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  const { nivel, letra } = z
    .object({ nivel: z.string().min(1).max(4), letra: z.string().min(1).max(2) })
    .parse(entrada);

  const curso = await resolverCurso(user, nivel, letra);
  if (!curso) return { salida: { error: "No tienes acceso a ese curso o no existe." } };

  const matriculas = await prisma.matricula.findMany({
    where: { cursoId: curso.id, colegioId: user.colegioId, estado: "ACTIVA" },
    select: { estudianteId: true },
  });
  const ids = matriculas.map((m) => m.estudianteId);

  const asistencias = await prisma.asistenciaDiaria.findMany({
    where: { colegioId: user.colegioId, estudianteId: { in: ids } },
    select: { estado: true },
  });
  const estados = asistencias.map((a) => a.estado as EstadoAsistencia);
  const resumen = calcularResumen(estados);
  const distribucion = { PRESENTE: 0, ATRASADO: 0, RETIRADO: 0, AUSENTE: 0 };
  for (const e of estados) distribucion[e]++;

  return {
    salida: {
      curso: nombreCurso(curso),
      totalEstudiantes: ids.length,
      porcentajeAsistencia: resumen.porcentaje,
      diasConRegistro: resumen.diasConRegistro,
      presentes: distribucion.PRESENTE,
      atrasados: distribucion.ATRASADO,
      retirados: distribucion.RETIRADO,
      ausentes: distribucion.AUSENTE,
    },
    auditar: {
      entidad: "Curso",
      entidadId: curso.id,
      meta: { herramienta: "resumen_asistencia_curso" },
    },
  };
}

async function alertasCurso(
  user: UsuarioIA,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  const { nivel, letra } = z
    .object({ nivel: z.string().min(1).max(4), letra: z.string().min(1).max(2) })
    .parse(entrada);

  const scope = alcanceCursosRiesgo(user);
  if (!scope) {
    return { salida: { error: "Tu rol no tiene acceso al panel de alertas de riesgo." } };
  }
  const curso = await resolverCurso(user, nivel, letra, scope);
  if (!curso) return { salida: { error: "No tienes acceso a ese curso o no existe." } };

  const matriculas = await prisma.matricula.findMany({
    where: { cursoId: curso.id, colegioId: user.colegioId, estado: "ACTIVA" },
    select: { estudiante: { select: { id: true, nombres: true, apellidos: true } } },
  });
  const estudiantes = matriculas.map((m) => m.estudiante);
  const ids = estudiantes.map((e) => e.id);

  const [asistencias, asignaturas, anotaciones] = await Promise.all([
    prisma.asistenciaDiaria.findMany({
      where: { colegioId: user.colegioId, estudianteId: { in: ids } },
      select: { estudianteId: true, estado: true },
    }),
    prisma.asignatura.findMany({
      where: { cursoId: curso.id, colegioId: user.colegioId },
      select: {
        evaluaciones: {
          where: { eliminadaEn: null, tipo: "SUMATIVA" },
          select: {
            ponderacion: true,
            calificaciones: {
              where: { estudianteId: { in: ids }, eliminadaEn: null },
              select: { estudianteId: true, nota: true, eximida: true },
            },
          },
        },
      },
    }),
    prisma.anotacion.groupBy({
      by: ["estudianteId"],
      where: {
        colegioId: user.colegioId,
        estudianteId: { in: ids },
        tipo: "NEGATIVA",
        eliminadaEn: null,
      },
      _count: { _all: true },
    }),
  ]);

  const estadosPorEst = new Map<string, EstadoAsistencia[]>();
  for (const a of asistencias) {
    const arr = estadosPorEst.get(a.estudianteId) ?? [];
    arr.push(a.estado as EstadoAsistencia);
    estadosPorEst.set(a.estudianteId, arr);
  }
  const negativasPorEst = new Map(anotaciones.map((g) => [g.estudianteId, g._count._all]));

  const filas = estudiantes
    .map((e) => {
      const resumen = calcularResumen(estadosPorEst.get(e.id) ?? []);
      const finales: number[] = [];
      let reprobadas = 0;
      let conNota = 0;
      for (const asig of asignaturas) {
        const items: ItemPromedio[] = asig.evaluaciones.map((ev) => {
          const cal = ev.calificaciones.find((c) => c.estudianteId === e.id);
          return {
            nota: cal?.eximida ? null : cal?.nota ?? null,
            ponderacion: ev.ponderacion,
            computa: !cal?.eximida,
          };
        });
        const prom = calcularPromedio(items).promedio;
        if (prom !== null) {
          conNota++;
          finales.push(prom);
          if (prom < NOTA_APROBACION) reprobadas++;
        }
      }
      const riesgo = evaluarRiesgo({
        porcentajeAsistencia: resumen.porcentaje,
        diasConRegistro: resumen.diasConRegistro,
        asignaturasReprobadas: reprobadas,
        asignaturasConNota: conNota,
        promedioGeneral: promedioGeneral(finales),
        anotacionesNegativas: negativasPorEst.get(e.id) ?? 0,
      });
      return { nombre: `${e.apellidos}, ${e.nombres}`, riesgo };
    })
    .sort((a, b) => ordenPorRiesgo(a.riesgo, b.riesgo));

  return {
    salida: {
      curso: nombreCurso(curso),
      estudiantes: filas.map((f) => ({
        nombre: f.nombre,
        riesgo: f.riesgo.nivel,
        factores: f.riesgo.factores.map((x) => x.etiqueta),
      })),
    },
    auditar: {
      entidad: "Curso",
      entidadId: curso.id,
      meta: { herramienta: "alertas_curso", estudiantes: filas.length },
    },
  };
}

async function estudiantesDeCurso(
  user: UsuarioIA,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  const { nivel, letra } = z
    .object({ nivel: z.string().min(1).max(4), letra: z.string().min(1).max(2) })
    .parse(entrada);

  const curso = await resolverCurso(user, nivel, letra);
  if (!curso) return { salida: { error: "No tienes acceso a ese curso o no existe." } };

  const matriculas = await prisma.matricula.findMany({
    where: { cursoId: curso.id, colegioId: user.colegioId, estado: "ACTIVA" },
    // Lista blanca: solo nombre, sin rut/salud/fecha.
    select: { estudiante: { select: { id: true, nombres: true, apellidos: true } } },
    orderBy: { estudiante: { apellidos: "asc" } },
  });

  const estudiantes = matriculas.map((m) => ({
    id: m.estudiante.id,
    nombre: `${m.estudiante.apellidos}, ${m.estudiante.nombres}`,
  }));

  return {
    salida: { curso: nombreCurso(curso), estudiantes, total: estudiantes.length },
    auditar: {
      entidad: "Curso",
      entidadId: curso.id,
      meta: { herramienta: "estudiantes_de_curso", total: estudiantes.length },
    },
  };
}

async function fichaEstudiante(
  user: UsuarioIA,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  const { estudianteId } = z.object({ estudianteId: z.string().min(1).max(40) }).parse(entrada);

  // Reautorización: el estudiante debe estar dentro del alcance del usuario.
  const estudiante = await prisma.estudiante.findFirst({
    where: { AND: [{ id: estudianteId }, alcanceEstudiantes(user)] },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { curso: { select: { nivel: true, letra: true } } },
        take: 1,
      },
    },
  });
  if (!estudiante) {
    return { salida: { error: "No tienes acceso a ese estudiante o no existe." } };
  }

  const [asistencias, anotacionesNeg] = await Promise.all([
    prisma.asistenciaDiaria.findMany({
      where: { colegioId: user.colegioId, estudianteId },
      select: { estado: true },
    }),
    prisma.anotacion.count({
      where: {
        colegioId: user.colegioId,
        estudianteId,
        tipo: "NEGATIVA",
        eliminadaEn: null,
      },
    }),
  ]);
  const resumen = calcularResumen(asistencias.map((a) => a.estado as EstadoAsistencia));

  return {
    salida: {
      nombre: `${estudiante.apellidos}, ${estudiante.nombres}`,
      curso: estudiante.matriculas[0]
        ? nombreCurso(estudiante.matriculas[0].curso)
        : "sin curso activo",
      porcentajeAsistencia: resumen.porcentaje,
      diasConRegistro: resumen.diasConRegistro,
      anotacionesNegativas: anotacionesNeg,
    },
    auditar: {
      entidad: "Estudiante",
      entidadId: estudiante.id,
      meta: { herramienta: "ficha_estudiante" },
    },
  };
}

// ── Pendientes operativos ─────────────────────────────────────────────────

const ROLES_PENDIENTES_COLEGIO = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

/**
 * Pendientes del libro de clases dentro del alcance del rol: firmas del
 * leccionario, cursos sin lista hoy (solo gestión) y evaluaciones sumativas
 * vencidas sin notas. Solo metadatos (curso, asignatura, fechas, conteos).
 */
async function pendientesOperativos(user: UsuarioIA): Promise<ResultadoHerramienta> {
  if (user.rol === "APODERADO" || user.rol === "ESTUDIANTE") {
    return { salida: { error: "Esta consulta es solo para el equipo del colegio." } };
  }
  const esGestion = ROLES_PENDIENTES_COLEGIO.has(user.rol);
  const filtroDocente = esGestion ? {} : { asignatura: { docenteId: user.id } };
  const hoy = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" })}T00:00:00Z`);

  const [sinFirmar, evalsVencidas, cursos, marcasHoy] = await Promise.all([
    prisma.claseRegistrada.findMany({
      where: { colegioId: user.colegioId, firmadaEn: null, eliminadaEn: null, ...filtroDocente },
      select: {
        fecha: true,
        asignatura: { select: { nombre: true, curso: { select: { nivel: true, letra: true } } } },
      },
      orderBy: { fecha: "asc" },
      take: 120,
    }),
    prisma.evaluacion.findMany({
      where: {
        colegioId: user.colegioId,
        tipo: "SUMATIVA",
        eliminadaEn: null,
        fecha: { lt: hoy },
        calificaciones: { none: { eliminadaEn: null } },
        ...(esGestion ? {} : { asignatura: { docenteId: user.id } }),
      },
      select: {
        nombre: true,
        fecha: true,
        asignatura: { select: { nombre: true, curso: { select: { nivel: true, letra: true } } } },
      },
      orderBy: { fecha: "asc" },
      take: 30,
    }),
    esGestion
      ? prisma.curso.findMany({
          where: { colegioId: user.colegioId },
          select: {
            nivel: true,
            letra: true,
            matriculas: { where: { estado: "ACTIVA" }, select: { estudianteId: true } },
          },
        })
      : Promise.resolve([]),
    esGestion
      ? prisma.asistenciaDiaria.findMany({
          where: { colegioId: user.colegioId, fecha: hoy },
          select: { estudianteId: true },
          distinct: ["estudianteId"],
        })
      : Promise.resolve([]),
  ]);

  const conMarca = new Set(marcasHoy.map((m) => m.estudianteId));
  const cursosSinListaHoy = esGestion
    ? cursos
        .filter((c) => c.matriculas.length > 0 && !c.matriculas.some((m) => conMarca.has(m.estudianteId)))
        .map((c) => `${c.nivel} ${c.letra}`)
    : undefined;

  return {
    salida: {
      alcance: esGestion ? "todo el colegio" : "solo tus asignaturas",
      clasesSinFirmar: {
        total: sinFirmar.length,
        detalle: sinFirmar.slice(0, 12).map((c) => ({
          fecha: c.fecha.toISOString().slice(0, 10),
          curso: `${c.asignatura.curso.nivel} ${c.asignatura.curso.letra}`,
          asignatura: c.asignatura.nombre,
        })),
      },
      evaluacionesVencidasSinNotas: {
        total: evalsVencidas.length,
        detalle: evalsVencidas.slice(0, 10).map((e) => ({
          fecha: e.fecha.toISOString().slice(0, 10),
          curso: `${e.asignatura.curso.nivel} ${e.asignatura.curso.letra}`,
          asignatura: e.asignatura.nombre,
          evaluacion: e.nombre,
        })),
      },
      ...(cursosSinListaHoy ? { cursosSinListaHoy } : {}),
    },
    auditar: {
      entidad: "pendientes",
      entidadId: user.colegioId,
      meta: { herramienta: "pendientes_operativos" },
    },
  };
}

// ── Horario de hoy del docente ───────────────────────────────────────────────

async function horarioHoy(user: UsuarioIA): Promise<ResultadoHerramienta> {
  if (user.rol === "APODERADO" || user.rol === "ESTUDIANTE") {
    return { salida: { error: "Esta consulta es para el equipo del colegio." } };
  }
  const { horaActualSantiago, diaSemanaHoySantiago } = await import("@/lib/fecha");
  const dia = diaSemanaHoySantiago();
  if (dia < 1 || dia > 5) {
    return { salida: { mensaje: "Hoy es fin de semana: sin bloques de clase." } };
  }
  const ahora = horaActualSantiago();
  const esGestion = ["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"].includes(user.rol);
  const bloques = await prisma.bloqueHorario.findMany({
    where: {
      colegioId: user.colegioId,
      eliminadaEn: null,
      dia,
      asignatura: esGestion
        ? { colegioId: user.colegioId }
        : {
            colegioId: user.colegioId,
            OR: [{ docenteId: user.id }, { curso: { profesorJefeId: user.id } }],
          },
    },
    select: {
      horaInicio: true,
      horaFin: true,
      asignatura: {
        select: { nombre: true, curso: { select: { nivel: true, letra: true } } },
      },
    },
    orderBy: { horaInicio: "asc" },
    take: 40,
  });
  if (!bloques.length) {
    return { salida: { mensaje: "No hay bloques en el horario de hoy." } };
  }
  return {
    salida: {
      horaActual: ahora,
      bloques: bloques.map((b) => ({
        horario: `${b.horaInicio}-${b.horaFin}`,
        asignatura: b.asignatura.nombre,
        curso: `${b.asignatura.curso.nivel} ${b.asignatura.curso.letra}`,
        estado:
          ahora >= b.horaFin ? "dictada" : ahora >= b.horaInicio ? "en curso" : "próxima",
      })),
    },
  };
}

// ── Próximas evaluaciones (alcance por rol) ─────────────────────────────────

async function proximasEvaluaciones(user: UsuarioIA): Promise<ResultadoHerramienta> {
  const { hoyEnSantiago, fechaDesdeISO } = await import("@/lib/fecha");
  const evaluaciones = await prisma.evaluacion.findMany({
    where: {
      colegioId: user.colegioId,
      eliminadaEn: null,
      fecha: { gte: fechaDesdeISO(hoyEnSantiago()) },
      asignatura: { curso: alcanceCursos(user) },
    },
    select: {
      nombre: true,
      tipo: true,
      fecha: true,
      asignatura: {
        select: { nombre: true, curso: { select: { nivel: true, letra: true } } },
      },
    },
    orderBy: { fecha: "asc" },
    take: 12,
  });
  if (!evaluaciones.length) {
    return { salida: { mensaje: "No hay evaluaciones agendadas hacia adelante." } };
  }
  return {
    salida: {
      evaluaciones: evaluaciones.map((e) => ({
        fecha: e.fecha.toISOString().slice(0, 10),
        evaluacion: e.nombre,
        tipo: e.tipo,
        asignatura: e.asignatura.nombre,
        curso: `${e.asignatura.curso.nivel} ${e.asignatura.curso.letra}`,
      })),
    },
    auditar: {
      entidad: "evaluaciones:proximas",
      entidadId: user.colegioId,
      meta: { herramienta: "proximas_evaluaciones" },
    },
  };
}

// ── Comunicados sin leer (solo apoderado) ───────────────────────────────────

async function comunicadosPendientes(user: UsuarioIA): Promise<ResultadoHerramienta> {
  if (user.rol !== "APODERADO") {
    return { salida: { error: "Esta consulta es solo para apoderados." } };
  }
  const pendientes = await prisma.comunicadoDestinatario.findMany({
    where: {
      colegioId: user.colegioId,
      apoderadoUsuarioId: user.id,
      leidoEn: null,
      comunicado: { eliminadoEn: null },
    },
    select: { comunicado: { select: { titulo: true, creadoEn: true } } },
    orderBy: { comunicado: { creadoEn: "desc" } },
    take: 10,
  });
  if (!pendientes.length) {
    return { salida: { mensaje: "No hay comunicados sin leer. ¡Al día!" } };
  }
  return {
    salida: {
      sinLeer: pendientes.length,
      comunicados: pendientes.map((p) => ({
        titulo: p.comunicado.titulo,
        fecha: p.comunicado.creadoEn.toISOString().slice(0, 10),
      })),
      nota: "El detalle se lee en el módulo Comunicación.",
    },
  };
}

// ── Promedios por asignatura de un estudiante ─────────────────────────────

/**
 * Promedios por asignatura y general de un estudiante (solo sumativas
 * ponderan), reautorizando el alcance. Lista blanca: nombre, curso y notas
 * agregadas; nada de RUT, salud ni contacto.
 */
async function promediosEstudiante(
  user: UsuarioIA,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  const { estudianteId } = z.object({ estudianteId: z.string().min(1).max(40) }).parse(entrada);

  const estudiante = await prisma.estudiante.findFirst({
    where: { AND: [{ id: estudianteId }, alcanceEstudiantes(user)] },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { curso: { select: { id: true, nivel: true, letra: true } } },
        take: 1,
      },
    },
  });
  if (!estudiante) {
    return { salida: { error: "No tienes acceso a ese estudiante o no existe." } };
  }
  const curso = estudiante.matriculas[0]?.curso;
  if (!curso) {
    return { salida: { error: "El estudiante no tiene matrícula activa." } };
  }

  const asignaturas = await prisma.asignatura.findMany({
    where: { cursoId: curso.id, colegioId: user.colegioId },
    select: {
      nombre: true,
      evaluaciones: {
        where: { eliminadaEn: null, tipo: "SUMATIVA" },
        select: {
          ponderacion: true,
          calificaciones: {
            where: { estudianteId, eliminadaEn: null },
            select: { nota: true, eximida: true },
          },
        },
      },
    },
    orderBy: { nombre: "asc" },
  });

  const porAsignatura = asignaturas
    .map((a) => {
      const items: ItemPromedio[] = a.evaluaciones.map((e) => {
        const cal = e.calificaciones[0];
        return {
          nota: cal?.eximida ? null : cal?.nota ?? null,
          ponderacion: e.ponderacion,
          computa: !cal?.eximida,
        };
      });
      return { asignatura: a.nombre, promedio: calcularPromedio(items).promedio };
    })
    .filter((p): p is { asignatura: string; promedio: number } => p.promedio !== null);
  const general = promedioGeneral(porAsignatura.map((p) => p.promedio));

  return {
    salida: {
      nombre: `${estudiante.apellidos}, ${estudiante.nombres}`,
      curso: nombreCurso(curso),
      promedioGeneral: general !== null ? Number(general.toFixed(1)) : null,
      porAsignatura: porAsignatura.map((p) => ({
        asignatura: p.asignatura,
        promedio: Number(p.promedio.toFixed(1)),
        bajoAprobacion: p.promedio < NOTA_APROBACION,
      })),
      nota: porAsignatura.length ? undefined : "Aún no hay notas registradas.",
    },
    auditar: {
      entidad: "Estudiante",
      entidadId: estudiante.id,
      meta: { herramienta: "promedios_estudiante" },
    },
  };
}

// ── Anotaciones agregadas de un curso (últimos 30 días) ───────────────────

async function anotacionesCurso(
  user: UsuarioIA,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  if (user.rol === "APODERADO" || user.rol === "ESTUDIANTE") {
    return { salida: { error: "Esta consulta es solo para el equipo del colegio." } };
  }
  const { nivel, letra } = z
    .object({ nivel: z.string().min(1).max(10), letra: z.string().min(1).max(4) })
    .parse(entrada);
  const curso = await resolverCurso(user, nivel, letra);
  if (!curso) return { salida: { error: "Curso no encontrado o fuera de tu alcance." } };

  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const matriculas = await prisma.matricula.findMany({
    where: { cursoId: curso.id, colegioId: user.colegioId, estado: "ACTIVA" },
    select: { estudianteId: true },
  });
  const ids = matriculas.map((m) => m.estudianteId);

  const grupos = await prisma.anotacion.groupBy({
    by: ["tipo"],
    where: {
      colegioId: user.colegioId,
      estudianteId: { in: ids },
      eliminadaEn: null,
      creadaEn: { gte: hace30 },
    },
    _count: { _all: true },
  });
  const positivas = grupos.find((g) => g.tipo === "POSITIVA")?._count._all ?? 0;
  const negativas = grupos.find((g) => g.tipo === "NEGATIVA")?._count._all ?? 0;

  return {
    salida: {
      curso: nombreCurso(curso),
      periodo: "últimos 30 días",
      estudiantes: ids.length,
      anotacionesPositivas: positivas,
      anotacionesNegativas: negativas,
      nota: "Recuento agregado, sin nombres ni textos. El detalle está en el Libro de clases.",
    },
  };
}

// ── Mensajes directos sin leer del usuario ────────────────────────────────

async function mensajesSinLeer(user: UsuarioIA): Promise<ResultadoHerramienta> {
  if (user.rol === "ESTUDIANTE") {
    return { salida: { error: "Los mensajes directos son entre apoderados y docentes." } };
  }
  const esApoderado = user.rol === "APODERADO";
  // Docente/gestión: mensajes DE apoderados, de estudiantes en su alcance.
  // Apoderado: respuestas DEL colegio, sobre sus pupilos.
  const mensajes = await prisma.mensajeDirecto.findMany({
    where: {
      colegioId: user.colegioId,
      leidoEn: null,
      deApoderado: !esApoderado,
      estudiante: alcanceEstudiantes(user),
      ...(esApoderado ? {} : { NOT: { autorId: user.id } }),
    },
    select: {
      cuerpo: true,
      creadoEn: true,
      estudiante: { select: { nombres: true, apellidos: true } },
    },
    orderBy: { creadoEn: "desc" },
    take: 10,
  });
  if (!mensajes.length) {
    return { salida: { mensaje: "No hay mensajes sin leer. ¡Al día!" } };
  }
  return {
    salida: {
      sinLeer: mensajes.length,
      mensajes: mensajes.map((m) => ({
        estudiante: `${m.estudiante.apellidos}, ${m.estudiante.nombres}`,
        fecha: m.creadoEn.toISOString().slice(0, 10),
        extracto: m.cuerpo.slice(0, 160),
      })),
      nota: "Responde desde el módulo Mensajes.",
    },
  };
}

// ── Situación final del año escolar (Decreto 67) ──────────────────────────

/**
 * Devuelve el resultado del año SOLO si existe la resolución firmada por
 * dirección (art. 11). Nunca adelanta la propuesta del sistema: informar una
 * decisión que el colegio aún no tomó sería peor que no responder.
 */
async function situacionFinalAnio(
  user: UsuarioIA,
  entrada: unknown
): Promise<ResultadoHerramienta> {
  const { estudianteId } = z.object({ estudianteId: z.string().min(1).max(40) }).parse(entrada);

  const estudiante = await prisma.estudiante.findFirst({
    where: { AND: [{ id: estudianteId }, alcanceEstudiantes(user)] },
    select: { id: true, nombres: true, apellidos: true },
  });
  if (!estudiante) {
    return { salida: { error: "No tienes acceso a ese estudiante o no existe." } };
  }

  const resolucion = await prisma.resolucionPromocion.findFirst({
    where: { colegioId: user.colegioId, estudianteId },
    orderBy: { resueltoEn: "desc" },
    select: { estado: true, resueltoEn: true, anioEscolarId: true },
  });
  if (!resolucion) {
    return {
      salida: {
        nombre: `${estudiante.apellidos}, ${estudiante.nombres}`,
        resuelto: false,
        mensaje:
          "El colegio aún no ha resuelto la situación final de este estudiante. Cuando la dirección la firme, aparecerá aquí y en la ficha del estudiante.",
      },
    };
  }
  const anio = await prisma.anioEscolar.findUnique({
    where: { id: resolucion.anioEscolarId },
    select: { anio: true },
  });

  const etiqueta =
    resolucion.estado === "PROMOVIDO"
      ? "promovido(a)"
      : resolucion.estado === "REPITE"
        ? "repite el nivel"
        : "en análisis caso a caso por el colegio";

  return {
    salida: {
      nombre: `${estudiante.apellidos}, ${estudiante.nombres}`,
      resuelto: true,
      anio: anio?.anio ?? null,
      situacion: etiqueta,
      fecha: resolucion.resueltoEn.toISOString().slice(0, 10),
      nota: "El fundamento completo de la resolución está en la ficha del estudiante.",
    },
    auditar: {
      entidad: "Estudiante",
      entidadId: estudiante.id,
      meta: { herramienta: "situacion_final_anio" },
    },
  };
}
