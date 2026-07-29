/**
 * Densidad de tablas ajustable y persistida por usuario (cookie, para que el
 * servidor renderice la densidad correcta sin parpadeo). "cómodo" por defecto.
 *
 * Este módulo es puro (sin `next/headers`) para poder importarse tanto desde
 * Server Components como desde el conmutador cliente. La lectura de la cookie
 * (server-only) vive en `densidad-servidor.ts`.
 */
export type Densidad = "comodo" | "compacto";

export const COOKIE_DENSIDAD = "ec_densidad";

/** Clases de padding de celda según densidad. */
export function celdaClase(d: Densidad): string {
  return d === "compacto" ? "px-4 py-1.5" : "px-4 py-3";
}
