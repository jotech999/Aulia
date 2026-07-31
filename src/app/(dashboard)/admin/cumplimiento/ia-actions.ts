"use server";

import { requerirSesion } from "@/lib/sesion";
import {
  generarSimulacroFiscalizacion,
  type ResultadoFiscalizacion,
} from "@/lib/ia/fiscalizacion";

const ROLES_DIRECTIVOS = new Set(["ADMIN", "DIRECTOR", "UTP"]);

export async function generarSimulacro(): Promise<ResultadoFiscalizacion> {
  const { user } = await requerirSesion();
  if (!ROLES_DIRECTIVOS.has(user.rol)) {
    return { ok: false, error: "El simulacro de fiscalización es solo para el equipo directivo." };
  }
  return generarSimulacroFiscalizacion({
    id: user.id,
    rol: user.rol,
    colegioId: user.colegioId,
  });
}
