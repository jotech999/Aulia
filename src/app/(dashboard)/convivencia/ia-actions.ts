"use server";

import { requerirRol } from "@/lib/sesion";
import { redactarActaConvivencia, type ResultadoRedaccion } from "@/lib/ia/registro-conducta";

/** Redacta la descripción de hechos de un caso de convivencia (debido proceso). */
export async function redactarActaIA(apunte: string): Promise<ResultadoRedaccion> {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "INSPECTOR");
  return redactarActaConvivencia({ id: user.id, rol: user.rol, colegioId: user.colegioId }, { apunte });
}
