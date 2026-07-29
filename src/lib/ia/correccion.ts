import type Anthropic from "@anthropic-ai/sdk";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import type { UsuarioDocente } from "./docente";
import type { MaterialGenerado } from "./material";

/**
 * CORRECCIÓN ASISTIDA: compara las respuestas de un/a estudiante contra la
 * pauta de una guía/evaluación del banco y PROPONE puntajes ítem por ítem.
 *
 * Cumplimiento (mismo diseño que lib/ia):
 *  - Es una PROPUESTA: el/la docente revisa y decide el puntaje final.
 *  - No se envía identidad del estudiante (se instruye transcribir solo las
 *    respuestas). Nada se guarda automáticamente.
 *  - Reautorización de rol en la action; auditoría sin PII.
 */

export type ItemCorregido = {
  numero: number;
  puntaje: number;
  maximo: number;
  comentario: string;
};

export type ResultadoCorreccion =
  | { ok: true; items: ItemCorregido[]; total: number; maximoTotal: number; observacion: string }
  | { ok: false; error: string };

const HERRAMIENTA_CORRECCION: Anthropic.Tool = {
  name: "entregar_correccion",
  description: "Entrega la corrección propuesta, ítem por ítem.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            numero: { type: "integer", description: "Número del ítem (1, 2, 3…)." },
            puntaje: {
              type: "number",
              description: "Puntaje propuesto (0 al máximo del ítem; medio punto permitido en desarrollo).",
            },
            comentario: {
              type: "string",
              description: "Justificación breve (1 frase) del puntaje, en español de Chile.",
            },
          },
          required: ["numero", "puntaje", "comentario"],
        },
      },
      observacion: {
        type: "string",
        description: "Observación general para el/la docente (2–3 frases): patrones de error y sugerencia de retroalimentación.",
      },
    },
    required: ["items", "observacion"],
  },
};

const SISTEMA_CORRECCION = `Eres un corrector pedagógico riguroso y justo para docentes chilenos, dentro de Aulia.
Corriges respuestas de estudiantes contra una pauta dada.

REGLAS:
- Asigna puntaje SOLO según la pauta entregada. En selección múltiple y V/F: todo o nada.
- En desarrollo: puntaje parcial proporcional al criterio de la pauta (permite .5).
- Si una respuesta está en blanco o es ilegible, asigna 0 y dilo en el comentario.
- Sé consistente: el mismo error recibe el mismo descuento.
- Comentarios breves, formativos y sin sarcasmo. Español de Chile.
- Es una PROPUESTA que el/la docente revisará: no declares la nota final.`;

export async function corregirRespuestas(
  user: UsuarioDocente,
  material: MaterialGenerado,
  respuestas: string
): Promise<ResultadoCorreccion> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  try {
    const pauta = material.items
      .map(
        (it, i) =>
          `Ítem ${i + 1} [${it.tipo}] (máx ${it.puntaje} pts)\nEnunciado: ${it.enunciado}${
            it.alternativas ? `\nAlternativas: ${it.alternativas.join(" | ")}` : ""
          }\nPauta: ${it.respuesta || "[criterio no especificado: usa el enunciado]"}`
      )
      .join("\n\n");

    const prompt = `Corrige las respuestas de un/a estudiante para "${material.titulo}" (${material.asignatura}, ${material.nivel}).

PAUTA OFICIAL (${material.items.length} ítems):
${pauta}

RESPUESTAS DEL ESTUDIANTE (transcritas por el/la docente, sin identidad):
${respuestas}

Entrega la corrección con la herramienta entregar_correccion: un elemento por ítem (numero 1 a ${material.items.length}), puntaje entre 0 y el máximo del ítem, y comentario breve. Si el estudiante no respondió un ítem, puntaje 0.`;

    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 3000,
        system: SISTEMA_CORRECCION,
        tools: [HERRAMIENTA_CORRECCION],
        tool_choice: { type: "tool", name: "entregar_correccion" },
        messages: [{ role: "user", content: prompt }],
      })
    );
    const bloque = respuesta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const crudo = bloque?.input as { items?: unknown; observacion?: unknown } | undefined;
    if (!crudo || !Array.isArray(crudo.items)) {
      return { ok: false, error: "La IA no devolvió una corrección válida. Intenta nuevamente." };
    }

    // Sanea y ancla cada puntaje al máximo REAL del ítem según la pauta.
    const items: ItemCorregido[] = material.items.map((it, i) => {
      const x = (crudo.items as Record<string, unknown>[]).find(
        (c) => Number(c.numero) === i + 1
      );
      const maximo = it.puntaje;
      const propuesto = x ? Number(x.puntaje) : 0;
      const puntaje = Math.min(Math.max(Number.isFinite(propuesto) ? propuesto : 0, 0), maximo);
      return {
        numero: i + 1,
        puntaje: Math.round(puntaje * 2) / 2, // pasos de medio punto
        maximo,
        comentario:
          x && typeof x.comentario === "string"
            ? x.comentario.trim().slice(0, 300)
            : "Sin respuesta detectada.",
      };
    });

    const total = items.reduce((s, it) => s + it.puntaje, 0);
    const maximoTotal = items.reduce((s, it) => s + it.maximo, 0);

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "correccion:material",
        entidadId: material.tipoMaterial,
        despues: { items: items.length }, // metadatos, sin PII
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return {
      ok: true,
      items,
      total,
      maximoTotal,
      observacion:
        typeof crudo.observacion === "string" ? crudo.observacion.trim().slice(0, 800) : "",
    };
  } catch (err) {
    console.error("[ia-correccion]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}
