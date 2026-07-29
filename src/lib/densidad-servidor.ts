import { cookies } from "next/headers";
import { COOKIE_DENSIDAD, type Densidad } from "./densidad";

/** Lee la densidad preferida del usuario desde la cookie (server-only). */
export async function leerDensidad(): Promise<Densidad> {
  const c = await cookies();
  return c.get(COOKIE_DENSIDAD)?.value === "compacto" ? "compacto" : "comodo";
}
