import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generarInformeCentinela } from "@/lib/ia/centinela";
import { iaDisponible } from "@/lib/ia/cliente";
import { crearNotificaciones } from "@/lib/notificaciones";
import { enviarEmail, emailDisponible, escaparHtml } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * RESUMEN SEMANAL AUTOMÁTICO — tarea programada (viernes por la tarde):
 * por cada colegio, el agente Centinela hace el barrido completo (asistencia,
 * alertas, pendientes) y el informe llega a dirección por campana y correo,
 * sin que nadie tenga que pedirlo.
 *
 * Seguridad: mismo esquema que las demás tareas (Bearer CRON_SECRET). El
 * barrido se ejecuta a nombre del primer directivo activo del colegio, con
 * lo cual hereda su alcance y queda auditado como CONSULTAR_IA.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return NextResponse.json({ error: "Tarea no configurada." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!iaDisponible()) {
    return NextResponse.json({ error: "IA no configurada." }, { status: 503 });
  }

  const colegios = await prisma.colegio.findMany({ select: { id: true, nombre: true } });
  const resultados: { colegio: string; ok: boolean; detalle?: string }[] = [];

  for (const colegio of colegios) {
    try {
      // Directivos activos del colegio (destinatarios) y el "autor" del barrido.
      const directivos = await prisma.membresia.findMany({
        where: { colegioId: colegio.id, activa: true, rol: { in: ["ADMIN", "DIRECTOR"] } },
        select: { rol: true, usuario: { select: { id: true, email: true, nombre: true } } },
        orderBy: { rol: "asc" }, // ADMIN primero como autor estable
      });
      if (!directivos.length) {
        resultados.push({ colegio: colegio.nombre, ok: false, detalle: "sin directivos" });
        continue;
      }
      const autor = directivos[0];
      const informe = await generarInformeCentinela({
        id: autor.usuario.id,
        rol: autor.rol,
        colegioId: colegio.id,
        nombre: autor.usuario.nombre,
        colegioNombre: colegio.nombre,
      });
      if (!informe.ok) {
        resultados.push({ colegio: colegio.nombre, ok: false, detalle: informe.error });
        continue;
      }

      // Campana para todos los directivos + correo con el informe completo.
      await crearNotificaciones(
        directivos.map((d) => ({
          colegioId: colegio.id,
          usuarioId: d.usuario.id,
          tipo: "GENERAL",
          titulo: "Resumen semanal del colegio (Centinela)",
          cuerpo: "El barrido semanal con IA está listo: asistencia, alertas y pendientes.",
          enlace: "/alertas",
        }))
      );
      if (emailDisponible()) {
        const html = `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:auto">
          <h2 style="color:#2a2150;margin:0 0 4px">Resumen semanal · ${escaparHtml(colegio.nombre)}</h2>
          <p style="color:#8a9188;font-size:13px;margin:0 0 16px">Generado automáticamente por el agente Centinela de Aulia. Revísalo antes de tomar decisiones.</p>
          <pre style="white-space:pre-wrap;font-family:inherit;color:#232032;font-size:14px;line-height:1.55;background:#f6f3fe;border-radius:12px;padding:16px">${escaparHtml(informe.informe)}</pre>
          <p style="border-top:1px solid #e5e2db;color:#a9afa6;font-size:11px;margin:20px 0 0;padding-top:10px">
            Enviado con <a href="https://aulia.cl" style="color:#8a5fe4;text-decoration:none;font-weight:600">Aulia</a>.
          </p>
        </div>`;
        for (const d of directivos) {
          await enviarEmail({
            to: d.usuario.email,
            subject: `Resumen semanal · ${colegio.nombre}`,
            html,
          });
        }
      }
      resultados.push({ colegio: colegio.nombre, ok: true });
    } catch (e) {
      resultados.push({
        colegio: colegio.nombre,
        ok: false,
        detalle: e instanceof Error ? e.message.slice(0, 200) : "error",
      });
    }
  }

  return NextResponse.json({ resultados });
}
