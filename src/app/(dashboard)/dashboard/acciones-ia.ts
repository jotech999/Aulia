"use server";

import { requerirSesion } from "@/lib/sesion";
import { generarResumenEjecutivo, type ResultadoEjecutivo } from "@/lib/ia/ejecutivo";

// Solo el equipo directivo genera el informe ejecutivo del colegio.
const ROLES_DIRECTIVOS = new Set(["ADMIN", "DIRECTOR", "UTP"]);

export async function generarResumenDireccion(): Promise<ResultadoEjecutivo> {
  const { user } = await requerirSesion();
  if (!ROLES_DIRECTIVOS.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para generar el informe ejecutivo." };
  }
  return generarResumenEjecutivo({
    id: user.id,
    rol: user.rol,
    colegioId: user.colegioId,
    nombre: user.name,
  });
}
