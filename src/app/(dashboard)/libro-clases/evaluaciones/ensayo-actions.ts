"use server";

import { requerirRol } from "@/lib/sesion";
import { generarEnsayo, type ResultadoEnsayo } from "@/lib/ia/ensayos";

/** Genera un ensayo SIMCE/PAES para una asignatura. Solo roles docentes. */
export async function generarEnsayoAction(entrada: {
  asignaturaId: string;
  tipoEnsayo: "SIMCE" | "PAES";
  cantidad: number;
}): Promise<ResultadoEnsayo> {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR");
  return generarEnsayo(
    { id: user.id, rol: user.rol, colegioId: user.colegioId },
    entrada
  );
}
