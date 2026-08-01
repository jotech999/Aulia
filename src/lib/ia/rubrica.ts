import type Anthropic from "@anthropic-ai/sdk";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";

/**
 * GENERADOR DE RÚBRICAS CON IA: a partir de la descripción de la evaluación,
 * propone el instrumento completo (criterios con niveles de desempeño y
 * descriptores). NO guarda nada: llena el editor y la persona docente revisa,
 * ajusta y guarda como borrador. Sin PII: solo recibe la descripción escrita
 * por el/la docente. Auditado como CONSULTAR_IA.
 */

export type UsuarioRubrica = { id: string; rol: string; colegioId: string };

export type NivelGenerado = { etiqueta: string; descriptor: string; puntaje: number };
export type CriterioGenerado = { descripcion: string; peso: number; niveles: NivelGenerado[] };
export type ResultadoRubricaIA =
  | { ok: true; nombre: string; descripcion: string; criterios: CriterioGenerado[] }
  | { ok: false; error: string };

const HERRAMIENTA_RUBRICA: Anthropic.Tool = {
  name: "entregar_rubrica",
  description: "Entrega el instrumento de evaluación completo.",
  input_schema: {
    type: "object",
    properties: {
      nombre: { type: "string", description: "Nombre breve del instrumento (máx. 120 caracteres)." },
      descripcion: {
        type: "string",
        description: "Propósito del instrumento en 1–2 oraciones (qué evalúa y en qué contexto).",
      },
      criterios: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descripcion: {
              type: "string",
              description: "El criterio o dimensión a evaluar (ej. 'Claridad de la exposición oral').",
            },
            peso: {
              type: "number",
              description: "Peso relativo del criterio (1 a 3; usa 1 salvo criterios centrales).",
            },
            niveles: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  etiqueta: { type: "string", description: "Nombre del nivel (ej. 'Destacado')." },
                  descriptor: {
                    type: "string",
                    description: "Descripción observable y específica del desempeño en este nivel para ESTE criterio.",
                  },
                  puntaje: { type: "number", description: "Puntaje del nivel (mayor = mejor)." },
                },
                required: ["etiqueta", "descriptor", "puntaje"],
              },
            },
          },
          required: ["descripcion", "peso", "niveles"],
        },
      },
    },
    required: ["nombre", "descripcion", "criterios"],
  },
};

const SISTEMA = `Eres un especialista en evaluación educativa para colegios chilenos (Decreto 67), dentro de Aulia.
Diseñas instrumentos de evaluación con criterios claros y descriptores OBSERVABLES: qué se ve en el trabajo del estudiante en cada nivel, sin ambigüedad.
Escribes en español de Chile, con lenguaje profesional, inclusivo y apropiado al nivel escolar indicado.
El resultado es un BORRADOR que la persona docente revisará y editará.`;

export async function generarRubricaIA(
  user: UsuarioRubrica,
  entrada: {
    descripcionEvaluacion: string;
    tipo: "RUBRICA" | "PAUTA_COTEJO";
    contexto?: string; // ej. "Lenguaje · 5° A"
  }
): Promise<ResultadoRubricaIA> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  const descripcionEvaluacion = entrada.descripcionEvaluacion.trim().slice(0, 1000);
  if (descripcionEvaluacion.length < 10) {
    return { ok: false, error: "Describe la evaluación con un poco más de detalle." };
  }

  const esPauta = entrada.tipo === "PAUTA_COTEJO";
  const instrucciones = esPauta
    ? `Genera una PAUTA DE COTEJO: entre 6 y 12 criterios (indicadores concretos y verificables), cada uno con EXACTAMENTE 2 niveles: "Logrado" (puntaje 1) y "No logrado" (puntaje 0). El descriptor de cada nivel indica qué evidencia se observa (o falta) para ese indicador.`
    : `Genera una RÚBRICA por niveles de desempeño: entre 3 y 6 criterios, cada uno con EXACTAMENTE 4 niveles: "Destacado" (4), "Logrado" (3), "En proceso" (2) e "Inicial" (1). Cada descriptor debe ser específico del criterio (no genérico) y describir desempeños observables, diferenciados con claridad entre niveles consecutivos.`;

  const prompt = `Diseña un instrumento de evaluación para esta actividad:
"${descripcionEvaluacion}"
${entrada.contexto ? `Contexto: ${entrada.contexto}.` : ""}

${instrucciones}

Usa peso 1 en todos los criterios, salvo 1 o 2 criterios centrales que pueden llevar peso 2. Entrega el instrumento mediante la herramienta entregar_rubrica.`;

  try {
    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 4000,
        system: SISTEMA,
        tools: [HERRAMIENTA_RUBRICA],
        tool_choice: { type: "tool", name: "entregar_rubrica" },
        messages: [{ role: "user", content: prompt }],
      })
    );
    const bloque = respuesta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const x = (bloque?.input ?? {}) as Record<string, unknown>;
    const nombre = typeof x.nombre === "string" ? x.nombre.trim().slice(0, 160) : "";
    const descripcion = typeof x.descripcion === "string" ? x.descripcion.trim().slice(0, 2000) : "";
    const crudos = Array.isArray(x.criterios) ? x.criterios : [];

    const criterios: CriterioGenerado[] = crudos
      .slice(0, 30)
      .map((c) => {
        const cr = c as Record<string, unknown>;
        const desc = typeof cr.descripcion === "string" ? cr.descripcion.trim().slice(0, 400) : "";
        const pesoBruto = Number(cr.peso);
        const peso = Number.isFinite(pesoBruto) ? Math.min(Math.max(Math.round(pesoBruto), 1), 100) : 1;
        const nivelesCrudos = Array.isArray(cr.niveles) ? cr.niveles : [];
        const vistos = new Set<string>();
        const niveles: NivelGenerado[] = nivelesCrudos
          .slice(0, 6)
          .map((n) => {
            const nv = n as Record<string, unknown>;
            const etiqueta = typeof nv.etiqueta === "string" ? nv.etiqueta.trim().slice(0, 80) : "";
            const descriptor =
              typeof nv.descriptor === "string" ? nv.descriptor.trim().slice(0, 800) : "";
            const pBruto = Number(nv.puntaje);
            const puntaje = Number.isFinite(pBruto) ? Math.min(Math.max(pBruto, 0), 10_000) : 0;
            return { etiqueta, descriptor, puntaje };
          })
          .filter((n) => {
            if (!n.etiqueta || !n.descriptor) return false;
            const k = n.etiqueta.toLocaleLowerCase("es");
            if (vistos.has(k)) return false; // etiquetas distintas (regla del schema)
            vistos.add(k);
            return true;
          });
        return { descripcion: desc, peso, niveles };
      })
      .filter(
        (c) =>
          c.descripcion.length >= 3 &&
          c.niveles.length >= 2 &&
          (!esPauta || c.niveles.length === 2)
      );

    if (!nombre || criterios.length === 0) {
      return { ok: false, error: "La IA no devolvió un instrumento válido. Intenta nuevamente." };
    }

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "borrador:rubrica",
        entidadId: "rubrica",
        despues: { tipo: entrada.tipo, criterios: criterios.length }, // sin PII
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }
    return { ok: true, nombre, descripcion, criterios };
  } catch (err) {
    console.error("[ia-rubrica]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}
