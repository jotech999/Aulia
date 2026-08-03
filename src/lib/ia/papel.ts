import type Anthropic from "@anthropic-ai/sdk";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import type { UsuarioDocente } from "./docente";
import type { ItemMaterial, MaterialGenerado, TipoItem } from "./material";

/**
 * LA PRUEBA EN PAPEL ENTRA POR LA CÁMARA.
 *
 * En Chile se sigue evaluando en papel. Hasta ahora, para usar la corrección
 * asistida había que TIPEAR las respuestas de cada estudiante, que es más
 * trabajo que corregir a mano — o sea, la herramienta no servía. Con la cámara
 * el flujo real del profesor entra a la plataforma tal como es:
 *
 *  1. `transcribirRespuestas`: foto(s) de la hoja de UN estudiante → el texto de
 *     sus respuestas, que se muestra en pantalla para que la persona docente lo
 *     corrija antes de puntuar (la letra manuscrita se lee mal a veces, y una
 *     transcripción equivocada no puede convertirse en una nota en silencio).
 *  2. `transcribirInstrumento`: foto(s) de una prueba antigua → el instrumento
 *     estructurado, para reutilizarlo como guía, PDF o evaluación online sin
 *     volver a escribirlo.
 *
 * Cumplimiento (Ley 21.719 · Circular 30):
 *  - Se instruye EXPLÍCITAMENTE no transcribir el nombre, el RUT ni ningún dato
 *    identificatorio que aparezca en la hoja, y además se filtra el resultado.
 *    La foto puede contener el encabezado con el nombre; lo que sale del modelo
 *    no debe.
 *  - Las imágenes no se guardan: viajan al modelo, se usan y se descartan.
 *  - Es siempre una PROPUESTA revisable. Nada se califica solo.
 *  - Reautorización de rol en la action; auditoría CONSULTAR_IA sin PII.
 */

/** Imagen ya comprimida en el navegador: base64 sin el prefijo `data:`. */
export type ImagenEntrada = {
  base64: string;
  tipo: "image/jpeg" | "image/png" | "image/webp";
};

export type ResultadoTranscripcion =
  | { ok: true; texto: string; aviso: string | null }
  | { ok: false; error: string };

export type ResultadoInstrumento =
  | { ok: true; material: MaterialGenerado; aviso: string | null }
  | { ok: false; error: string };

/** Tope defensivo: 4 fotos y ~5 MB por foto ya comprimida. */
const MAX_IMAGENES = 4;
const MAX_BYTES_B64 = 7_000_000; // ~5 MB binarios

function validarImagenes(imagenes: ImagenEntrada[]): string | null {
  if (!Array.isArray(imagenes) || imagenes.length === 0) return "Adjunta al menos una foto.";
  if (imagenes.length > MAX_IMAGENES) {
    return `Máximo ${MAX_IMAGENES} fotos por vez. Divide la prueba en partes.`;
  }
  for (const img of imagenes) {
    if (!img || typeof img.base64 !== "string" || img.base64.length < 100) {
      return "Una de las fotos no se pudo leer. Vuelve a tomarla.";
    }
    if (img.base64.length > MAX_BYTES_B64) {
      return "Una de las fotos es demasiado pesada. Acércate más al papel y repite la toma.";
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(img.tipo)) {
      return "Formato de imagen no admitido. Usa una foto normal (JPG o PNG).";
    }
  }
  return null;
}

function bloquesDeImagen(imagenes: ImagenEntrada[]): Anthropic.ImageBlockParam[] {
  return imagenes.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.tipo, data: img.base64 },
  }));
}

/**
 * Red de seguridad sobre la minimización de datos: aunque al modelo se le pide
 * no transcribir identidades, si aparece una línea con "Nombre:" o un RUT se
 * elimina antes de mostrarla. Se prefiere perder una línea a filtrar un dato.
 */
export function quitarIdentidades(texto: string): { limpio: string; huboRecorte: boolean } {
  const rut = /\b\d{1,2}[.\s]?\d{3}[.\s]?\d{3}\s*-\s*[\dkK]\b/;
  const encabezado = /^\s*(nombre|nombres|apellidos?|alumn[oa]|estudiante|rut|r\.u\.t)\b\s*:?/i;
  let huboRecorte = false;
  const lineas = texto.split("\n").filter((l) => {
    if (encabezado.test(l) || rut.test(l)) {
      huboRecorte = true;
      return false;
    }
    return true;
  });
  return { limpio: lineas.join("\n").trim(), huboRecorte };
}

const SISTEMA_TRANSCRIPCION = `Transcribes hojas de respuestas escolares fotografiadas, para docentes chilenos, dentro de Aulia.

REGLAS QUE NO PUEDES ROMPER:
- NO transcribas el nombre, apellido, RUT, curso ni ningún dato que identifique al estudiante, aunque aparezca en la hoja. Ignóralos por completo.
- Transcribe SOLO las respuestas, numeradas como aparecen en la hoja: "1: ...", "2: ...".
- Copia lo que está escrito, sin corregir ortografía ni completar ideas. Si el estudiante se equivocó, el error debe aparecer.
- Si una respuesta está en blanco, escribe "1: [en blanco]".
- Si algo es ilegible, escribe "[ilegible]" en ese punto en vez de adivinar.
- No asignes puntajes ni juzgues las respuestas: solo transcribes.`;

/** Foto(s) de la hoja de un estudiante → texto de sus respuestas, sin identidad. */
export async function transcribirRespuestas(
  user: UsuarioDocente,
  imagenes: ImagenEntrada[]
): Promise<ResultadoTranscripcion> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  const problema = validarImagenes(imagenes);
  if (problema) return { ok: false, error: problema };

  try {
    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 2500,
        system: SISTEMA_TRANSCRIPCION,
        messages: [
          {
            role: "user",
            content: [
              ...bloquesDeImagen(imagenes),
              {
                type: "text",
                text: "Transcribe las respuestas de esta hoja, numeradas. Recuerda: sin nombre, sin RUT, sin curso. Solo las respuestas.",
              },
            ],
          },
        ],
      })
    );

    const bruto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!bruto) {
      return {
        ok: false,
        error: "No se pudo leer nada en la foto. Prueba con más luz y la hoja completa en el cuadro.",
      };
    }

    const { limpio, huboRecorte } = quitarIdentidades(bruto);
    if (!limpio) {
      return { ok: false, error: "La foto no muestra respuestas legibles. Vuelve a tomarla." };
    }

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "lectura:hoja-respuestas",
        entidadId: "papel",
        despues: { fotos: imagenes.length }, // sin PII ni contenido
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return {
      ok: true,
      texto: limpio.slice(0, 8000),
      aviso: [
        huboRecorte
          ? "Se descartaron las líneas con nombre o RUT: la plataforma no guarda la identidad junto a la transcripción."
          : null,
        limpio.includes("[ilegible]")
          ? "Hay partes ilegibles marcadas como [ilegible]. Complétalas antes de corregir."
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
    };
  } catch (err) {
    console.error("[ia-papel-respuestas]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}

const HERRAMIENTA_INSTRUMENTO: Anthropic.Tool = {
  name: "entregar_instrumento",
  description: "Entrega la prueba fotografiada, ya estructurada ítem por ítem.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Título de la prueba tal como aparece en la hoja." },
      instrucciones: {
        type: "string",
        description: "Instrucciones generales para el estudiante que aparecen en la hoja (si no hay, escribe unas breves y coherentes).",
      },
      items: {
        type: "array",
        description: "Los ítems en el mismo orden de la hoja.",
        items: {
          type: "object",
          properties: {
            tipo: {
              type: "string",
              enum: ["seleccion", "verdadero_falso", "desarrollo"],
              description: "Tipo del ítem según cómo está planteado en la hoja.",
            },
            enunciado: { type: "string", description: "El enunciado, transcrito literalmente." },
            alternativas: {
              type: "array",
              items: { type: "string" },
              description: "Solo para selección múltiple: las alternativas SIN la letra (a), b)…).",
            },
            respuesta: {
              type: "string",
              description:
                "La respuesta correcta o el criterio de corrección. Si la hoja NO trae la pauta, escribe exactamente: [falta la pauta].",
            },
            puntaje: { type: "number", description: "Puntaje del ítem según la hoja; si no aparece, usa 1." },
          },
          required: ["tipo", "enunciado", "respuesta", "puntaje"],
        },
      },
    },
    required: ["titulo", "instrucciones", "items"],
  },
};

const SISTEMA_INSTRUMENTO = `Digitalizas pruebas y guías escolares chilenas fotografiadas, dentro de Aulia.

REGLAS:
- Transcribe los enunciados LITERALMENTE. No los mejores, no los reescribas, no agregues ítems que no están.
- NO transcribas nombres de estudiantes, RUT ni cursos si aparecen en la hoja.
- Si la hoja no trae la pauta de respuestas, no la inventes: escribe "[falta la pauta]" en ese campo.
- Si una parte no se lee, transcribe lo legible y marca lo demás como "[ilegible]".
- Español de Chile.
El resultado es un BORRADOR que la persona docente revisará antes de usar.`;

/** Foto(s) de una prueba en papel → instrumento estructurado y reutilizable. */
export async function transcribirInstrumento(
  user: UsuarioDocente,
  imagenes: ImagenEntrada[],
  contexto: { asignatura: string; nivel: string }
): Promise<ResultadoInstrumento> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  const problema = validarImagenes(imagenes);
  if (problema) return { ok: false, error: problema };

  try {
    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 5000,
        system: SISTEMA_INSTRUMENTO,
        tools: [HERRAMIENTA_INSTRUMENTO],
        tool_choice: { type: "tool", name: "entregar_instrumento" },
        messages: [
          {
            role: "user",
            content: [
              ...bloquesDeImagen(imagenes),
              {
                type: "text",
                text: `Digitaliza esta prueba en papel de ${contexto.asignatura}, ${contexto.nivel}. Entrégala con la herramienta entregar_instrumento, respetando el orden y el texto original.`,
              },
            ],
          },
        ],
      })
    );

    const bloque = respuesta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const x = (bloque?.input ?? {}) as Record<string, unknown>;
    /*
     * Los topes de aquí replican EXACTAMENTE los de `esquemaContenidoMaterial`
     * en la action del asistente docente, que revalida el material antes de
     * imprimirlo, corregirlo o guardarlo en el banco. Cuando eran más laxos, la
     * digitalización "funcionaba" y después el PDF fallaba con un mensaje
     * incomprensible: una prueba con ítems de 15 puntos o con 35 preguntas
     * quedaba en un callejón sin salida para la persona docente.
     */
    const titulo = typeof x.titulo === "string" ? x.titulo.trim().slice(0, 180) : "";
    const instrucciones =
      typeof x.instrucciones === "string" ? x.instrucciones.trim().slice(0, 800) : "";
    const crudos = Array.isArray(x.items) ? x.items : [];
    const recortados = Math.max(0, crudos.length - 30);

    let sinPauta = 0;
    const items: ItemMaterial[] = crudos
      .slice(0, 30)
      .map((c) => {
        const it = c as Record<string, unknown>;
        const tipoBruto = typeof it.tipo === "string" ? it.tipo : "desarrollo";
        const tipo: TipoItem = (
          ["seleccion", "verdadero_falso", "desarrollo"] as const
        ).includes(tipoBruto as TipoItem)
          ? (tipoBruto as TipoItem)
          : "desarrollo";
        const enunciado =
          typeof it.enunciado === "string" ? it.enunciado.trim().slice(0, 1200) : "";
        const respuesta =
          typeof it.respuesta === "string" ? it.respuesta.trim().slice(0, 1200) : "";
        if (!respuesta || respuesta.includes("[falta la pauta]")) sinPauta++;
        const alternativas = Array.isArray(it.alternativas)
          ? it.alternativas
              .filter((a): a is string => typeof a === "string")
              .map((a) => a.trim().slice(0, 300))
              .filter(Boolean)
              .slice(0, 6)
          : undefined;
        const pBruto = Number(it.puntaje);
        const puntaje = Number.isFinite(pBruto) ? Math.min(Math.max(Math.round(pBruto), 1), 10) : 1;
        // Un ítem de selección necesita al menos 2 alternativas para ser válido;
        // si la foto solo dejó legible una, vale más tratarlo como desarrollo
        // que dejar un material que después el PDF rechaza.
        const bastantesAlternativas = (alternativas?.length ?? 0) >= 2;
        const tipoFinal: TipoItem =
          tipo === "seleccion" && !bastantesAlternativas ? "desarrollo" : tipo;
        return {
          tipo: tipoFinal,
          enunciado,
          alternativas: tipoFinal === "seleccion" ? alternativas : undefined,
          respuesta,
          puntaje,
        };
      })
      .filter((it) => it.enunciado.length >= 3);

    if (!titulo || items.length === 0) {
      return {
        ok: false,
        error: "No se pudo reconocer una prueba en la foto. Asegúrate de que la hoja salga completa y derecha.",
      };
    }

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "lectura:instrumento-papel",
        entidadId: "papel",
        despues: { fotos: imagenes.length, items: items.length }, // sin PII
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return {
      ok: true,
      material: {
        tipoMaterial: "evaluacion",
        titulo,
        asignatura: contexto.asignatura,
        nivel: contexto.nivel,
        instrucciones,
        items,
        oaCodigos: [],
      },
      aviso:
        [
          sinPauta > 0
            ? `${sinPauta} ${sinPauta === 1 ? "ítem quedó" : "ítems quedaron"} sin pauta porque la foto no la incluye. Complétala antes de corregir con esta prueba.`
            : null,
          recortados > 0
            ? `La prueba trae más de 30 preguntas: se digitalizaron las primeras 30 y quedaron ${recortados} fuera. Fotografía el resto por separado.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
    };
  } catch (err) {
    console.error("[ia-papel-instrumento]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}
