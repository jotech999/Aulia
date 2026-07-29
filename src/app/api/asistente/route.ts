import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { iaDisponible, mensajeErrorIA } from "@/lib/ia/cliente";
import { responderAsistente, type MensajeChat } from "@/lib/ia/asistente";

const cuerpoSchema = z.object({
  mensajes: z
    .array(
      z.object({
        rol: z.enum(["user", "assistant"]),
        texto: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(20),
});

export async function POST(req: Request) {
  // Autorización: siempre a partir de la sesión del servidor (multi-tenant).
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!iaDisponible()) {
    return NextResponse.json({ error: "El asistente no está disponible." }, { status: 503 });
  }

  let datos: unknown;
  try {
    datos = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = cuerpoSchema.safeParse(datos);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const user = {
    id: sesion.user.id,
    rol: sesion.user.rol,
    colegioId: sesion.user.colegioId,
    nombre: sesion.user.name,
    colegioNombre: sesion.user.colegioNombre,
  };

  try {
    const { respuesta, herramientas } = await responderAsistente(
      user,
      parsed.data.mensajes as MensajeChat[]
    );
    return NextResponse.json({ respuesta, herramientas });
  } catch (e) {
    console.error("[asistente]", e instanceof Error ? e.message : "error");
    const { config, mensaje } = mensajeErrorIA(e);
    // 502 = mala configuración (credencial/modelo) que debe resolver la dirección;
    // 503 = problema transitorio, reintentable.
    return NextResponse.json({ error: mensaje }, { status: config ? 502 : 503 });
  }
}
