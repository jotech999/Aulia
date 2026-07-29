import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIJO = "enc:v1";

function obtenerClave() {
  const secreto = process.env.DATOS_SENSIBLES_KEY ?? process.env.PIE_ENCRYPTION_KEY;
  if (!secreto) throw new Error("CIFRADO_NO_CONFIGURADO");
  return createHash("sha256").update(secreto).digest();
}

export function cifrarDetalleJustificacion(texto: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", obtenerClave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIJO, iv.toString("base64url"), tag.toString("base64url"), cifrado.toString("base64url")].join(":");
}

function descifrarProtegido(valor: string | null) {
  if (!valor?.startsWith(`${PREFIJO}:`)) return null;
  try {
    const [, , iv, tag, datos] = valor.split(":");
    const decipher = createDecipheriv("aes-256-gcm", obtenerClave(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(datos, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Los detalles históricos en claro se ocultan: pueden contener datos sensibles. */
export function descifrarDetalleJustificacion(valor: string | null) {
  return descifrarProtegido(valor);
}

/** La categoría se cifra en registros nuevos; conserva etiquetas acotadas legacy. */
export function descifrarMotivoJustificacion(valor: string | null) {
  const protegido = descifrarProtegido(valor);
  if (protegido) return protegido;
  return valor && ["Salud", "Trámite", "Familiar", "Otro"].includes(valor)
    ? valor
    : "Antecedente reservado";
}

/** Resoluciones visibles solo para los participantes autorizados del caso. */
export function descifrarFundamentoJustificacion(valor: string | null) {
  // Los fundamentos legacy eran texto libre y pudieron contener PII; se ocultan
  // hasta ejecutar un backfill controlado en vez de reenviarlos al navegador.
  return descifrarProtegido(valor);
}
