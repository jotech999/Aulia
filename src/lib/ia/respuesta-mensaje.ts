import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import type { UsuarioIA } from "./alcance";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * RESPUESTA SUGERIDA EN MENSAJES: el profesor jefe recibe mensajes de
 * apoderados todo el día; este agente lee el hilo y propone una respuesta
 * cordial y resolutiva, lista para editar y enviar.
 *
 * Minimización: al modelo van solo los últimos mensajes del hilo (texto que
 * las partes ya comparten entre sí) y el nombre de pila del estudiante.
 * La autorización de participación en el hilo la valida el llamador.
 */

export type ResultadoRespuesta =
  | { ok: true; borrador: string }
  | { ok: false; error: string };

const SISTEMA = `Eres el asistente de redacción de un profesor jefe chileno dentro de Aulia. Propones la respuesta al último mensaje del apoderado en el hilo.

REGLAS:
- Tono cordial, profesional y cercano; tratamiento de "usted". Español de Chile.
- Responde lo que el apoderado pregunta; si pide algo que requiere gestión (reunión, justificativo, revisión de nota), propone el paso concreto ("puedo recibirle el día...", "envíe el justificativo por el módulo de inasistencias").
- Breve: 2 a 5 frases. Sin emojis. No prometas nada irreversible (cambios de nota, medidas) — ofrece revisar o conversar.
- NO inventes hechos, fechas ni datos del estudiante que el hilo no mencione.
- Responde SOLO con el texto del mensaje, sin comillas ni preámbulos.`;

export async function sugerirRespuestaMensaje(
  user: UsuarioIA,
  estudianteId: string
): Promise<ResultadoRespuesta> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }

  const [mensajes, estudiante] = await Promise.all([
    prisma.mensajeDirecto.findMany({
      where: { colegioId: user.colegioId, estudianteId },
      orderBy: { creadoEn: "desc" },
      take: 10,
      select: { deApoderado: true, cuerpo: true },
    }),
    prisma.estudiante.findFirst({
      where: { id: estudianteId, colegioId: user.colegioId },
      select: { nombres: true },
    }),
  ]);
  if (!mensajes.length) return { ok: false, error: "El hilo aún no tiene mensajes." };
  if (!mensajes[0].deApoderado) {
    return { ok: false, error: "El último mensaje es tuyo: espera la respuesta del apoderado." };
  }

  const hilo = [...mensajes]
    .reverse()
    .map((m) => `${m.deApoderado ? "Apoderado" : "Profesor jefe"}: ${m.cuerpo}`)
    .join("\n");

  try {
    const cliente = clienteIA();
    const mensaje = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 500,
        system: SISTEMA,
        messages: [
          {
            role: "user",
            content: `Estudiante (nombre de pila): ${estudiante?.nombres.split(" ")[0] ?? "—"}\nHilo reciente:\n${hilo}`,
          },
        ],
      })
    );
    const borrador = mensaje.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!borrador) return { ok: false, error: "No se pudo sugerir una respuesta." };

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "ia:respuesta-mensaje",
        entidadId: estudianteId,
        despues: { herramienta: "respuesta_mensaje" },
      });
    } catch {
      /* no botar la sugerencia */
    }
    return { ok: true, borrador };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}
