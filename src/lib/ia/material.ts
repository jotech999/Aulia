import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import { whereAsignaturasAccesibles } from "@/app/(dashboard)/planificacion/consultas";
import type { UsuarioDocente } from "./docente";

/**
 * Generación de MATERIAL IMPRIMIBLE (guías de ejercicios y evaluaciones) con IA.
 *
 * Mismo diseño de cumplimiento que `docente.ts`:
 *  - Produce material EDITABLE que el/la docente revisa antes de imprimir.
 *  - No usa datos de estudiantes: solo asignatura, nivel y OA del currículum.
 *  - Reautoriza rol + pertenencia (multi-tenant) y audita el uso sin PII.
 *  - Sin `ANTHROPIC_API_KEY` degrada de forma segura.
 */

export type TipoMaterial = "guia" | "evaluacion";
export type TipoItem = "seleccion" | "verdadero_falso" | "desarrollo";
export type Dificultad = "basica" | "media" | "avanzada";

export type ItemMaterial = {
  tipo: TipoItem;
  enunciado: string;
  /** Solo para selección múltiple: 3–5 alternativas SIN letra (se numeran al imprimir). */
  alternativas?: string[];
  /** Respuesta correcta / criterio de corrección (va a la pauta del docente). */
  respuesta: string;
  puntaje: number;
};

export type MaterialGenerado = {
  tipoMaterial: TipoMaterial;
  titulo: string;
  asignatura: string;
  nivel: string;
  instrucciones: string;
  items: ItemMaterial[];
  oaCodigos: string[];
};

export type ResultadoMaterial =
  | { ok: true; material: MaterialGenerado }
  | { ok: false; error: string };

const ETIQUETA_DIFICULTAD: Record<Dificultad, string> = {
  basica: "básica (inicio de la unidad, ítems directos)",
  media: "media (aplicación y análisis)",
  avanzada: "avanzada (análisis, síntesis y problemas de varios pasos)",
};

const HERRAMIENTA_MATERIAL: Anthropic.Tool = {
  name: "entregar_material",
  description: "Entrega la guía o evaluación estructurada, lista para imprimir.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Título del material (ej. 'Guía N°2: Fracciones equivalentes')." },
      instrucciones: {
        type: "string",
        description: "Instrucciones generales para el/la estudiante, 1–3 oraciones.",
      },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tipo: {
              type: "string",
              enum: ["seleccion", "verdadero_falso", "desarrollo"],
              description: "seleccion = alternativas; verdadero_falso; desarrollo = respuesta escrita.",
            },
            enunciado: { type: "string", description: "Enunciado completo del ítem." },
            alternativas: {
              type: "array",
              items: { type: "string" },
              description: "Solo si tipo=seleccion: 4 alternativas SIN letra inicial (una correcta).",
            },
            respuesta: {
              type: "string",
              description:
                "Respuesta correcta. En seleccion, el texto exacto de la alternativa correcta. En desarrollo, criterio breve de corrección.",
            },
            puntaje: { type: "integer", description: "Puntaje del ítem (1–10)." },
          },
          required: ["tipo", "enunciado", "respuesta", "puntaje"],
        },
      },
    },
    required: ["titulo", "instrucciones", "items"],
  },
};

const SISTEMA_MATERIAL = `Eres un asistente pedagógico para docentes de un colegio chileno, dentro de Aulia.
Creas guías de ejercicios y evaluaciones IMPRIMIBLES, alineadas con las Bases Curriculares del Mineduc.

REGLAS:
- Español de Chile, claro y apropiado para el nivel indicado.
- Los ítems deben ser resolubles SOLO con lápiz y papel (sin internet ni material anexo).
- Variedad y progresión: parte con ítems más simples y sube la exigencia.
- En selección múltiple entrega exactamente 4 alternativas plausibles, sin letras (A/B/C) al inicio, con UNA sola correcta.
- No incluyas imágenes ni tablas complejas: solo texto.
- No inventes citas textuales de autores reales; si necesitas un texto breve para comprensión lectora, créalo tú e indícalo como original.
- El material es un BORRADOR que el/la docente revisará y editará antes de aplicar.`;

async function auditar(user: UsuarioDocente, tipo: TipoMaterial, meta: Record<string, unknown>) {
  try {
    await registrarAuditoria({
      colegioId: user.colegioId,
      usuarioId: user.id,
      accion: "CONSULTAR_IA",
      entidad: `material:${tipo}`,
      entidadId: tipo,
      despues: meta, // metadatos, sin PII
    });
  } catch {
    // La auditoría no debe romper la respuesta.
  }
}

/**
 * Genera una guía o evaluación estructurada para una asignatura, anclada en los
 * OA reales del nivel. Reautoriza (multi-tenant) antes de reunir contexto.
 */
export async function generarMaterialImprimible(
  user: UsuarioDocente,
  entrada: {
    tipoMaterial: TipoMaterial;
    asignaturaId: string;
    tema: string;
    numeroItems: number;
    dificultad: Dificultad;
  }
): Promise<ResultadoMaterial> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  const numeroItems = Math.min(Math.max(Math.round(entrada.numeroItems), 3), 20);

  const asignatura = await prisma.asignatura.findFirst({
    where: { id: entrada.asignaturaId, ...whereAsignaturasAccesibles(user) },
    select: { nombre: true, curso: { select: { nivel: true } } },
  });
  if (!asignatura) return { ok: false, error: "No tienes acceso a esa asignatura." };

  // Lista blanca curricular: solo código, eje y descripción del OA (sin PII).
  const oas = await prisma.oa.findMany({
    where: { nivel: asignatura.curso.nivel, asignatura: asignatura.nombre },
    orderBy: { numero: "asc" },
    select: { codigo: true, eje: true, descripcion: true },
    take: 40,
  });
  const listaOa = oas.length
    ? oas.map((o) => `- ${o.codigo} (${o.eje}): ${o.descripcion}`).join("\n")
    : "(No hay OA cargados; alinéate con las Bases Curriculares del nivel.)";

  const esEval = entrada.tipoMaterial === "evaluacion";
  const prompt = `Crea una ${esEval ? "EVALUACIÓN" : "GUÍA DE EJERCICIOS"} de ${asignatura.nombre} para nivel ${asignatura.curso.nivel} (Chile).
Tema: "${entrada.tema}".
Cantidad de ítems: exactamente ${numeroItems}.
Dificultad: ${ETIQUETA_DIFICULTAD[entrada.dificultad]}.

Objetivos de Aprendizaje del nivel (alinéa los ítems con los más pertinentes al tema):
${listaOa}

${esEval
    ? "Mezcla tipos de ítem: aproximadamente 50% selección múltiple, 20% verdadero/falso y 30% desarrollo. Asigna puntajes coherentes (desarrollo vale más)."
    : "Prioriza ítems de desarrollo y práctica (aprox. 60% desarrollo, 40% selección o verdadero/falso). Usa puntaje 1 si es práctica sin nota."}

Entrega el material mediante la herramienta entregar_material.`;

  try {
    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 4000,
        system: SISTEMA_MATERIAL,
        tools: [HERRAMIENTA_MATERIAL],
        tool_choice: { type: "tool", name: "entregar_material" },
        messages: [{ role: "user", content: prompt }],
      })
    );
    const bloque = respuesta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const crudo = bloque?.input as
      | { titulo?: unknown; instrucciones?: unknown; items?: unknown }
      | undefined;
    if (!crudo || !Array.isArray(crudo.items)) {
      return { ok: false, error: "La IA no devolvió material válido. Intenta nuevamente." };
    }

    const items: ItemMaterial[] = crudo.items
      .slice(0, numeroItems)
      .map((c) => {
        const x = c as Record<string, unknown>;
        const tipo: TipoItem =
          x.tipo === "seleccion" || x.tipo === "verdadero_falso" ? x.tipo : "desarrollo";
        const alternativas =
          tipo === "seleccion" && Array.isArray(x.alternativas)
            ? x.alternativas
                .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
                .map((a) => a.trim().slice(0, 300))
                .slice(0, 5)
            : undefined;
        return {
          // Un ítem de "selección" sin alternativas suficientes se degrada a desarrollo.
          tipo: tipo === "seleccion" && (alternativas?.length ?? 0) < 2 ? ("desarrollo" as const) : tipo,
          enunciado: typeof x.enunciado === "string" ? x.enunciado.trim().slice(0, 1200) : "",
          alternativas: alternativas && alternativas.length >= 2 ? alternativas : undefined,
          respuesta: typeof x.respuesta === "string" ? x.respuesta.trim().slice(0, 1200) : "",
          puntaje: Math.min(Math.max(Math.round(Number(x.puntaje) || 1), 1), 10),
        };
      })
      .filter((i) => i.enunciado.length > 0);

    if (items.length === 0) {
      return { ok: false, error: "La IA no devolvió ítems válidos. Intenta nuevamente." };
    }

    const material: MaterialGenerado = {
      tipoMaterial: entrada.tipoMaterial,
      titulo:
        typeof crudo.titulo === "string" && crudo.titulo.trim()
          ? crudo.titulo.trim().slice(0, 180)
          : `${esEval ? "Evaluación" : "Guía"}: ${entrada.tema.slice(0, 140)}`,
      asignatura: asignatura.nombre,
      nivel: asignatura.curso.nivel,
      instrucciones:
        typeof crudo.instrucciones === "string"
          ? crudo.instrucciones.trim().slice(0, 800)
          : "Lee con atención cada pregunta y responde con lápiz pasta.",
      items,
      oaCodigos: oas.slice(0, 6).map((o) => o.codigo),
    };

    await auditar(user, entrada.tipoMaterial, {
      asignaturaId: entrada.asignaturaId,
      nivel: asignatura.curso.nivel,
      items: items.length,
      dificultad: entrada.dificultad,
    });
    return { ok: true, material };
  } catch (err) {
    console.error("[ia-material]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}
