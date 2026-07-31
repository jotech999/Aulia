"use server";

import { requerirRol } from "@/lib/sesion";
import { redactarAnotacion, type ResultadoRedaccion } from "@/lib/ia/registro-conducta";

/** Redacta una anotación formal desde un apunte rápido. Solo staff docente. */
export async function redactarAnotacionIA(entrada: {
  apunte: string;
  tipo: "POSITIVA" | "NEGATIVA" | "NEUTRA";
}): Promise<ResultadoRedaccion> {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR");
  return redactarAnotacion({ id: user.id, rol: user.rol, colegioId: user.colegioId }, entrada);
}
