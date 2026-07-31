"use server";

import { requerirSesion } from "@/lib/sesion";
import { redactarComunicado, type ResultadoComunicado } from "@/lib/ia/comunicados";
import { iaDisponible } from "@/lib/ia/cliente";

// Quienes pueden crear comunicados pueden pedir el borrador con IA.
const ROLES_COMUNICAN = new Set(["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR"]);

export async function redactarConIA(entrada: {
  idea: string;
  audiencia?: string;
}): Promise<ResultadoComunicado> {
  const { user } = await requerirSesion();
  if (!ROLES_COMUNICAN.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para redactar comunicados." };
  }
  return redactarComunicado({ id: user.id, rol: user.rol, colegioId: user.colegioId }, entrada);
}

export async function redactorDisponible(): Promise<boolean> {
  return iaDisponible();
}
