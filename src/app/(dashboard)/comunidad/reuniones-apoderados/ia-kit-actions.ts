"use server";

import { requerirRol } from "@/lib/sesion";
import { generarKitReunion, type ResultadoKit } from "@/lib/ia/reunion";

export async function generarKit(cursoId: string): Promise<ResultadoKit> {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE");
  return generarKitReunion({ id: user.id, rol: user.rol, colegioId: user.colegioId }, cursoId);
}
