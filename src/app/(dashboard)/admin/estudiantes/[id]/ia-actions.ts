"use server";

import { requerirSesion } from "@/lib/sesion";
import { generarInformeEstudiante, type ResultadoInforme } from "@/lib/ia/docente";

/** Genera con IA un informe/retroalimentación del estudiante desde sus datos reales. */
export async function generarInformeIA(estudianteId: string): Promise<ResultadoInforme> {
  const { user } = await requerirSesion();
  return generarInformeEstudiante(user, estudianteId);
}
