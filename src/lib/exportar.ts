/**
 * Utilidades de exportación a CSV para reportes normativos (SIGE, actas, EDE).
 *
 * Convenciones para compatibilidad con Excel en español de Chile:
 * - Separador `;` (Excel es-CL usa punto y coma; la coma es separador decimal).
 * - BOM UTF-8 al inicio, para que Excel muestre bien tildes y ñ.
 * - Fin de línea CRLF (estándar CSV / Windows).
 */

/** Escapa un valor de celda CSV (comillas, separador, saltos de línea). */
function celda(valor: string | number | null | undefined): string {
  let s = valor == null ? "" : String(valor);
  // Anti-inyección de fórmulas (CSV injection): un texto que empieza con = + - @
  // podría ejecutarse al abrir en Excel/Sheets. Se antepone un apóstrofo, que Excel
  // interpreta como "texto literal". Solo aplica a strings (los números quedan intactos).
  if (typeof valor === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Construye el texto CSV a partir de encabezados y filas. */
export function construirCsv(
  encabezados: string[],
  filas: Array<Array<string | number | null | undefined>>
): string {
  const BOM = "﻿";
  const lineas = [encabezados, ...filas].map((f) => f.map(celda).join(";"));
  return BOM + lineas.join("\r\n") + "\r\n";
}

/** Respuesta HTTP de descarga de un CSV con nombre de archivo. */
export function respuestaCsv(nombreArchivo: string, contenido: string): Response {
  return new Response(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Nombre de archivo seguro (sin acentos ni caracteres problemáticos). */
export function nombreSeguro(base: string): string {
  return base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
