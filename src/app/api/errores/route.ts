import { NextRequest } from "next/server";

/**
 * Receptor de errores del cliente (fronteras de error de React).
 * Registra en el log del servidor con prefijo estructurado "[monitor]" —
 * visible en Vercel Logs / consola — para detectar fallas en producción.
 *
 * Minimización: solo mensaje, ruta y stack truncados. Sin cookies ni PII.
 * Best-effort: nunca falla hacia el cliente.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      mensaje?: unknown;
      stack?: unknown;
      url?: unknown;
      digest?: unknown;
    };
    const limpiar = (v: unknown, max: number) =>
      typeof v === "string" ? v.slice(0, max) : "";
    console.error(
      "[monitor] error-cliente",
      JSON.stringify({
        mensaje: limpiar(body.mensaje, 500),
        digest: limpiar(body.digest, 100),
        url: limpiar(body.url, 300),
        stack: limpiar(body.stack, 1500),
        ts: new Date().toISOString(),
      })
    );
  } catch {
    // Cuerpo inválido: se ignora.
  }
  return new Response(null, { status: 204 });
}
