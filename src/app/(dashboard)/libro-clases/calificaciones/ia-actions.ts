"use server";

import { requerirSesion } from "@/lib/sesion";
import { analizarCursoAsignatura, type ResultadoAnalisis } from "@/lib/ia/docente";
import {
  analizarEvaluacion,
  type ResultadoAnalisisEvaluacion,
} from "@/lib/ia/evaluacion";

/** Análisis pedagógico del curso en una asignatura, con IA, desde las notas reales. */
export async function analizarAsignaturaIA(asignaturaId: string): Promise<ResultadoAnalisis> {
  const { user } = await requerirSesion();
  return analizarCursoAsignatura(user, asignaturaId);
}

/**
 * Análisis de UNA evaluación: qué no se logró y una clase de refuerzo propuesta.
 * La autorización sobre la asignatura se re-verifica dentro de `analizarEvaluacion`.
 */
export async function analizarEvaluacionIA(
  evaluacionId: string
): Promise<ResultadoAnalisisEvaluacion> {
  const { user } = await requerirSesion();
  if (typeof evaluacionId !== "string" || !evaluacionId) {
    return { ok: false, error: "Datos inválidos." };
  }
  return analizarEvaluacion(user, evaluacionId);
}
