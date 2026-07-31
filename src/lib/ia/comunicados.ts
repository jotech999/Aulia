import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import type { UsuarioIA } from "./alcance";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * AGENTE REDACTOR DE COMUNICADOS: el equipo escribe la idea en 1-2 líneas y el
 * agente produce el comunicado formal completo (título + cuerpo) con tono
 * institucional chileno, listo para revisar y publicar.
 *
 * No consume datos de estudiantes: trabaja solo con el texto que el usuario
 * escribe. El resultado es siempre un BORRADOR editable.
 */

export type ResultadoComunicado =
  | { ok: true; titulo: string; cuerpo: string }
  | { ok: false; error: string };

const SISTEMA = `Redactas comunicados oficiales de un colegio chileno a las familias, dentro de Aulia.

REGLAS:
- Tono institucional cercano: formal pero humano, español de Chile, tratamiento de "usted" a los apoderados.
- Estructura del cuerpo: saludo breve → información esencial (qué, cuándo, dónde, qué se pide a la familia) → cierre cordial firmado como "La Dirección" (o quien corresponda según la idea).
- Concreto y escaneable: párrafos cortos; usa viñetas si hay varios puntos. Sin emojis salvo que la idea los pida.
- NO inventes fechas, horarios, costos ni datos que la idea no entregue: si falta un dato clave, deja el marcador [completar: dato].
- NUNCA incluyas datos personales de estudiantes identificables ni información de salud.
- Responde EXCLUSIVAMENTE con JSON válido: {"titulo": "...", "cuerpo": "..."} sin ningún texto adicional.`;

const esquemaSalida = z.object({ titulo: z.string().min(3), cuerpo: z.string().min(20) });

export async function redactarComunicado(
  user: UsuarioIA,
  entrada: { idea: string; audiencia?: string }
): Promise<ResultadoComunicado> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  const { idea, audiencia } = z
    .object({ idea: z.string().min(5).max(1200), audiencia: z.string().max(120).optional() })
    .parse(entrada);

  try {
    const cliente = clienteIA();
    const mensaje = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 900,
        system: SISTEMA,
        messages: [
          {
            role: "user",
            content: `Idea del comunicado: ${idea}\nAudiencia: ${audiencia ?? "todas las familias del colegio"}`,
          },
        ],
      })
    );
    const texto = mensaje.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // Tolerante a texto extra alrededor del JSON (por si el modelo agrega algo).
    const coincidencia = texto.match(/\{[\s\S]*\}/);
    if (!coincidencia) return { ok: false, error: "La IA no devolvió un borrador válido. Intenta de nuevo." };
    const parseado = esquemaSalida.safeParse(JSON.parse(coincidencia[0]));
    if (!parseado.success) {
      return { ok: false, error: "La IA no devolvió un borrador válido. Intenta de nuevo." };
    }

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "borrador:comunicado",
        entidadId: "comunicado",
        despues: { largoIdea: idea.length }, // metadatos, sin contenido
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return { ok: true, titulo: parseado.data.titulo, cuerpo: parseado.data.cuerpo };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}
