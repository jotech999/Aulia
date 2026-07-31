"use server";

import { requerirSesion } from "@/lib/sesion";
import { generarInformeCentinela, type ResultadoCentinela } from "@/lib/ia/centinela";

// El centinela recorre TODO el colegio: solo equipo directivo.
const ROLES_DIRECTIVOS = new Set(["ADMIN", "DIRECTOR", "UTP"]);

export async function generarCentinela(): Promise<ResultadoCentinela> {
  const { user } = await requerirSesion();
  if (!ROLES_DIRECTIVOS.has(user.rol)) {
    return { ok: false, error: "El informe centinela es solo para el equipo directivo." };
  }
  return generarInformeCentinela({
    id: user.id,
    rol: user.rol,
    colegioId: user.colegioId,
    nombre: user.name,
    colegioNombre: user.colegioNombre,
  });
}
