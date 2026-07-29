"use server";

import { requerirSesion } from "@/lib/sesion";
import { analizarCursoAsignatura, type ResultadoAnalisis } from "@/lib/ia/docente";

/** Análisis pedagógico del curso en una asignatura, con IA, desde las notas reales. */
export async function analizarAsignaturaIA(asignaturaId: string): Promise<ResultadoAnalisis> {
  const { user } = await requerirSesion();
  return analizarCursoAsignatura(user, asignaturaId);
}
