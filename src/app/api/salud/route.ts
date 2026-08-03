import { NextResponse } from "next/server";

/**
 * LATIDO DE SALUD — endpoint minúsculo y público que sirve para dos cosas:
 *
 *  1. Mantener el servicio despierto. En el plan gratuito de Render, si no
 *     entra ninguna petición HTTP durante ~15 minutos el contenedor se apaga y
 *     la siguiente persona espera ~50 segundos mirando la pantalla de arranque
 *     de Render. Eso pasa aunque haya profesores con la pestaña abierta: tener
 *     la página abierta no genera tráfico. Un latido periódico lo evita.
 *  2. Comprobar de un vistazo si la aplicación responde.
 *
 * Es deliberadamente barato: sin sesión, sin consultas y sin datos. No devuelve
 * NADA del colegio ni de las personas: no hay nada que filtrar.
 *
 * A propósito NO toca la base de datos. Un endpoint público que abriera una
 * conexión por petición sería un amplificador gratuito: cualquiera podría
 * agotar el pool desde fuera. Para despertar el servicio basta con que llegue
 * una petición HTTP, que es justo lo que Render mira.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sin caché en ningún punto del camino: si un CDN respondiera por nosotros, el
// contenedor seguiría durmiéndose y el latido no habría servido de nada.
const CABECERAS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  return NextResponse.json(
    { ok: true, servicio: "aulia", momento: new Date().toISOString() },
    { status: 200, headers: CABECERAS }
  );
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: CABECERAS });
}
