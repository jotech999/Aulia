import crypto from "node:crypto";

/**
 * Cifrado simétrico autenticado (AES-256-GCM) para campos de máxima sensibilidad
 * (Ley 21.719), p. ej. el diagnóstico PIE. La clave vive SOLO en el entorno
 * (`PIE_ENCRYPTION_KEY`, 32 bytes en hex de 64 o base64), nunca en la BD ni en el
 * repo. Sin clave, el cifrado no está disponible y la feature se bloquea de forma
 * segura (mejor no guardar que guardar en claro).
 *
 * Formato del payload: `iv.tag.ciphertext` (todo base64).
 */

function clave(): Buffer {
  const raw = process.env.PIE_ENCRYPTION_KEY;
  if (!raw) throw new Error("PIE_ENCRYPTION_KEY no configurada.");
  const buf = raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("PIE_ENCRYPTION_KEY debe ser de 32 bytes (hex de 64 o base64).");
  }
  return buf;
}

export function cifradoDisponible(): boolean {
  try {
    clave();
    return true;
  } catch {
    return false;
  }
}

export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", clave(), iv);
  const ct = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function descifrar(payload: string): string {
  const [ivB, tagB, ctB] = payload.split(".");
  if (!ivB || !tagB || !ctB) throw new Error("Payload cifrado inválido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", clave(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Descifra de forma segura; si algo falla, devuelve un marcador (no revienta la UI). */
export function descifrarSeguro(payload: string): string {
  try {
    return descifrar(payload);
  } catch {
    return "[no disponible]";
  }
}
