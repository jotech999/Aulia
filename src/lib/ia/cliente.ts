import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente de IA (Claude / Anthropic) para el asistente escolar.
 *
 * Diseño de cumplimiento (Ley 21.719 · Circular 30), validado con el subagente
 * `experto-normativa`:
 *  - El asistente opera SOLO en modo lectura + borrador. Nunca ejecuta
 *    mutaciones sobre el libro de clases.
 *  - Cada herramienta reautoriza rol + pertenencia en el servidor y devuelve
 *    campos con lista blanca explícita: JAMÁS `fichaSalud` ni `rut`.
 *  - Los accesos a datos de estudiantes se registran en `audit_log` con
 *    metadatos, nunca con información personal.
 *
 * Sin `ANTHROPIC_API_KEY` el asistente queda desactivado de forma segura.
 */

export const IA_MODELO = process.env.IA_MODELO || "claude-opus-4-8";

export function iaDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cliente: Anthropic | null = null;

export function clienteIA(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no configurada: el asistente está desactivado.");
  }
  cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cliente;
}

/** ¿El error de la API es transitorio (reintentable) o de configuración? */
function estadoError(e: unknown): number | undefined {
  return typeof e === "object" && e !== null ? (e as { status?: number }).status : undefined;
}

/**
 * Ejecuta una llamada a la IA reintentando ante fallos TRANSITORIOS (429, 5xx,
 * red). Los errores de configuración (401/403/404 de modelo) no se reintentan.
 */
export async function conReintento<T>(fn: () => Promise<T>, intentos = 2): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      const status = estadoError(e);
      const transitorio = status === undefined || status === 429 || status >= 500;
      if (!transitorio || i === intentos - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw ultimo;
}

/**
 * Traduce un error de la API a un mensaje claro. `config: true` marca un
 * problema de configuración (credencial/modelo) que debe resolver la dirección,
 * no un fallo pasajero.
 */
export function mensajeErrorIA(e: unknown): { config: boolean; mensaje: string } {
  const status = estadoError(e);
  if (status === 401 || status === 403) {
    return { config: true, mensaje: "La IA no está bien configurada (credenciales inválidas). Avisa a la dirección del colegio." };
  }
  if (status === 404) {
    return { config: true, mensaje: "El modelo de IA no está disponible para esta cuenta. Avisa a la dirección." };
  }
  // 400 = solicitud rechazada por la API (modelo/cuenta sin acceso, sin saldo, o
  // parámetro no soportado). No se arregla reintentando: es de configuración.
  if (status === 400) {
    return { config: true, mensaje: "La IA rechazó la solicitud. Revisa la configuración de la cuenta (modelo, saldo o credenciales). Avisa a la dirección." };
  }
  return { config: false, mensaje: "El asistente tuvo un problema temporal. Intenta nuevamente en unos segundos." };
}
