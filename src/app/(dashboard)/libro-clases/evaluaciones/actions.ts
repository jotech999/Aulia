"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { puntajeANota } from "@/lib/calificaciones";
import { fechaDesdeISO, hoyEnSantiago } from "@/lib/fecha";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const GESTION = new Set(["ADMIN", "DIRECTOR", "UTP"]);

/** Autoriza al usuario sobre una asignatura (docente, jefe del curso o gestión). */
async function autorizarAsignatura(
  user: { id: string; rol: string; colegioId: string },
  asignaturaId: string
) {
  const asig = await prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId: user.colegioId },
    select: { id: true, cursoId: true, docenteId: true, curso: { select: { profesorJefeId: true } } },
  });
  if (!asig) return null;
  const ok =
    GESTION.has(user.rol) || asig.docenteId === user.id || asig.curso.profesorJefeId === user.id;
  return ok ? asig : null;
}

// ── Banco de preguntas ───────────────────────────────────────────────────────
const alternativaSchema = z.object({ texto: z.string().trim().min(1).max(400), correcta: z.boolean() });
const preguntaSchema = z.object({
  asignaturaId: z.string().min(1),
  tipo: z.enum(["ALTERNATIVAS", "VF", "RESPUESTA_CORTA"]),
  enunciado: z.string().trim().min(3).max(1000),
  oaCodigo: z.string().trim().max(20).optional().or(z.literal("")),
  puntaje: z.number().int().min(1).max(100),
  alternativas: z.array(alternativaSchema).max(6).optional(),
  vfCorrecta: z.boolean().optional(),
  respuestaEsperada: z.string().trim().max(400).optional().or(z.literal("")),
});

export async function crearPregunta(input: unknown): Promise<Resultado<{ id: string }>> {
  const parsed = preguntaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de la pregunta inválidos." };
  const d = parsed.data;
  const { user } = await requerirSesion();
  if (!(await autorizarAsignatura(user, d.asignaturaId)))
    return { ok: false, error: "No tienes permiso sobre esta asignatura." };

  if (d.tipo === "ALTERNATIVAS") {
    if (!d.alternativas || d.alternativas.length < 2)
      return { ok: false, error: "Agrega al menos dos alternativas." };
    if (!d.alternativas.some((a) => a.correcta))
      return { ok: false, error: "Marca la alternativa correcta." };
  }
  if (d.tipo === "VF" && d.vfCorrecta === undefined)
    return { ok: false, error: "Indica si la afirmación es verdadera o falsa." };

  const pregunta = await prisma.pregunta.create({
    data: {
      colegioId: user.colegioId,
      asignaturaId: d.asignaturaId,
      tipo: d.tipo,
      enunciado: d.enunciado,
      oaCodigo: d.oaCodigo || null,
      puntaje: d.puntaje,
      vfCorrecta: d.tipo === "VF" ? d.vfCorrecta : null,
      respuestaEsperada: d.tipo === "RESPUESTA_CORTA" ? d.respuestaEsperada || null : null,
      autorId: user.id,
      alternativas:
        d.tipo === "ALTERNATIVAS" && d.alternativas
          ? { create: d.alternativas.map((a, i) => ({ texto: a.texto, correcta: a.correcta, orden: i })) }
          : undefined,
    },
    select: { id: true },
  });
  revalidatePath("/libro-clases/evaluaciones");
  return { ok: true, id: pregunta.id };
}

export async function eliminarPregunta(id: string): Promise<Resultado> {
  const { user } = await requerirSesion();
  const p = await prisma.pregunta.findFirst({ where: { id, colegioId: user.colegioId }, select: { asignaturaId: true } });
  if (!p || !(await autorizarAsignatura(user, p.asignaturaId))) return { ok: false, error: "No encontrada." };
  await prisma.pregunta.update({ where: { id }, data: { eliminadaEn: new Date() } });
  revalidatePath("/libro-clases/evaluaciones");
  return { ok: true };
}

// ── Quizzes ──────────────────────────────────────────────────────────────────
const quizSchema = z.object({
  asignaturaId: z.string().min(1),
  titulo: z.string().trim().min(3).max(160),
  preguntaIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function crearQuiz(input: unknown): Promise<Resultado<{ id: string }>> {
  const parsed = quizSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Elige un título y al menos una pregunta." };
  const { asignaturaId, titulo, preguntaIds } = parsed.data;
  const { user } = await requerirSesion();
  if (!(await autorizarAsignatura(user, asignaturaId)))
    return { ok: false, error: "No tienes permiso sobre esta asignatura." };

  // Las preguntas deben ser de esta asignatura y colegio.
  const validas = await prisma.pregunta.findMany({
    where: { id: { in: preguntaIds }, asignaturaId, colegioId: user.colegioId, eliminadaEn: null },
    select: { id: true },
  });
  if (validas.length === 0) return { ok: false, error: "Preguntas no válidas." };

  const quiz = await prisma.quiz.create({
    data: {
      colegioId: user.colegioId,
      asignaturaId,
      titulo,
      autorId: user.id,
      preguntas: { create: validas.map((p, i) => ({ preguntaId: p.id, orden: i })) },
    },
    select: { id: true },
  });
  revalidatePath("/libro-clases/evaluaciones");
  return { ok: true, id: quiz.id };
}

// ── Corrección automática de un estudiante ───────────────────────────────────
const respuestaSchema = z.object({
  preguntaId: z.string().min(1),
  alternativaId: z.string().optional(), // ALTERNATIVAS
  vf: z.boolean().optional(), // VF
  correctaManual: z.boolean().optional(), // RESPUESTA_CORTA
});
const corregirSchema = z.object({
  quizId: z.string().min(1),
  estudianteId: z.string().min(1),
  respuestas: z.array(respuestaSchema).max(200),
});

export async function guardarResultado(input: unknown): Promise<Resultado<{ nota: number; puntaje: number; puntajeMax: number }>> {
  const parsed = corregirSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Respuestas inválidas." };
  const { quizId, estudianteId, respuestas } = parsed.data;
  const { user } = await requerirSesion();

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, colegioId: user.colegioId, eliminadoEn: null },
    select: {
      asignaturaId: true,
      preguntas: {
        select: {
          pregunta: {
            select: { id: true, tipo: true, puntaje: true, vfCorrecta: true, alternativas: { select: { id: true, correcta: true } } },
          },
        },
      },
    },
  });
  if (!quiz || !(await autorizarAsignatura(user, quiz.asignaturaId)))
    return { ok: false, error: "Quiz no encontrado." };
  // El estudiante debe tener matrícula activa en el curso de la asignatura.
  const asig = await prisma.asignatura.findUnique({ where: { id: quiz.asignaturaId }, select: { cursoId: true } });
  const matri = await prisma.matricula.findFirst({
    where: { estudianteId, cursoId: asig!.cursoId, estado: "ACTIVA", colegioId: user.colegioId },
    select: { id: true },
  });
  if (!matri) return { ok: false, error: "El estudiante no está en el curso." };

  const respPorPregunta = new Map(respuestas.map((r) => [r.preguntaId, r]));
  let puntaje = 0;
  let puntajeMax = 0;
  for (const qp of quiz.preguntas) {
    const p = qp.pregunta;
    puntajeMax += p.puntaje;
    const r = respPorPregunta.get(p.id);
    if (!r) continue;
    let correcta = false;
    if (p.tipo === "ALTERNATIVAS") {
      correcta = p.alternativas.some((a) => a.id === r.alternativaId && a.correcta);
    } else if (p.tipo === "VF") {
      correcta = r.vf !== undefined && r.vf === p.vfCorrecta;
    } else {
      correcta = r.correctaManual === true; // respuesta corta: corrección manual
    }
    if (correcta) puntaje += p.puntaje;
  }
  const nota = puntajeANota(puntaje, puntajeMax);

  await prisma.resultadoQuiz.upsert({
    where: { quizId_estudianteId: { quizId, estudianteId } },
    update: { puntaje, puntajeMax, nota, corregidoEn: new Date() },
    create: { colegioId: user.colegioId, quizId, estudianteId, puntaje, puntajeMax, nota },
  });
  revalidatePath("/libro-clases/evaluaciones");
  return { ok: true, nota, puntaje, puntajeMax };
}

// ── Vaciado a calificaciones ─────────────────────────────────────────────────
const vaciarSchema = z.object({
  quizId: z.string().min(1),
  nombre: z.string().trim().min(2).max(120),
  ponderacion: z.number().min(1).max(100),
  periodo: z.number().int().min(1).max(3),
});

export async function vaciarANotas(input: unknown): Promise<Resultado<{ n: number }>> {
  const parsed = vaciarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de vaciado inválidos." };
  const { quizId, nombre, ponderacion, periodo } = parsed.data;
  const { user } = await requerirSesion();

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, colegioId: user.colegioId, eliminadoEn: null },
    select: { asignaturaId: true, resultados: { select: { estudianteId: true, nota: true } } },
  });
  if (!quiz || !(await autorizarAsignatura(user, quiz.asignaturaId)))
    return { ok: false, error: "Quiz no encontrado." };
  if (quiz.resultados.length === 0) return { ok: false, error: "No hay resultados corregidos que vaciar." };

  // Idempotencia: un quiz se vacía UNA vez (evita duplicar la evaluación y
  // contar la nota doble en el promedio). Circular 30 / Decreto 67.
  const yaVaciado = await prisma.evaluacion.findFirst({
    where: { quizId, colegioId: user.colegioId, eliminadaEn: null },
    select: { id: true },
  });
  if (yaVaciado) return { ok: false, error: "Este quiz ya fue vaciado a calificaciones." };

  const hoy = hoyEnSantiago();
  const n = await prisma.$transaction(async (tx) => {
    const evaluacion = await tx.evaluacion.create({
      data: {
        colegioId: user.colegioId,
        asignaturaId: quiz.asignaturaId,
        nombre,
        tipo: "SUMATIVA",
        ponderacion,
        periodo,
        fecha: fechaDesdeISO(hoy),
        quizId,
      },
      select: { id: true },
    });
    for (const r of quiz.resultados) {
      const cal = await tx.calificacion.create({
        data: {
          colegioId: user.colegioId,
          evaluacionId: evaluacion.id,
          estudianteId: r.estudianteId,
          nota: r.nota,
          registradoPorId: user.id,
        },
        select: { id: true },
      });
      // Auditoría por calificación (valor legal del libro; Circular 30).
      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "CREAR",
          entidad: "Calificacion",
          entidadId: cal.id,
          despues: { origen: "quiz", quizId, evaluacionId: evaluacion.id, estudianteId: r.estudianteId, nota: r.nota },
        },
        tx
      );
    }
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "Evaluacion",
        entidadId: evaluacion.id,
        despues: { origen: "quiz", quizId, nombre, ponderacion, periodo, calificaciones: quiz.resultados.length },
      },
      tx
    );
    return quiz.resultados.length;
  });

  revalidatePath("/libro-clases/evaluaciones");
  revalidatePath("/libro-clases/calificaciones");
  return { ok: true, n };
}
