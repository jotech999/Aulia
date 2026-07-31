import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import type { UsuarioIA } from "./alcance";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * AGENTE DE ENSAYOS SIMCE / PAES (pedido docente): genera un ensayo tipo
 * prueba estandarizada chilena para la asignatura — preguntas de alternativas
 * al estilo del instrumento real — y lo deja como quiz online listo para
 * aplicar, con sus preguntas guardadas en el banco de la asignatura.
 *
 * Solo contenido curricular: no consume ni recibe datos de estudiantes.
 * El resultado es un BORRADOR que la profesora revisa antes de aplicar.
 */

export type ResultadoEnsayo =
  | { ok: true; quizId: string; cantidad: number }
  | { ok: false; error: string };

const SISTEMA = `Eres un elaborador experto de ítems para pruebas estandarizadas chilenas (SIMCE de la Agencia de Calidad y PAES del DEMRE), dentro de Aulia.

REGLAS DE ELABORACIÓN:
- Cada pregunta es de selección múltiple con 4 alternativas (A-D), UNA sola correcta.
- Estilo del instrumento real: enunciados con contexto (situaciones, textos breves, datos), distractores plausibles basados en errores frecuentes, sin ambigüedad.
- SIMCE: alineado a las Bases Curriculares del nivel indicado. PAES: alineado al temario DEMRE vigente de la prueba correspondiente (Competencia Lectora, Competencia Matemática M1/M2, Ciencias, Historia).
- Si la asignatura requiere una lectura, incluye el texto breve DENTRO del enunciado de la pregunta (autocontenido).
- Español de Chile, sin emojis. Dificultad variada (fácil → difícil).
- Responde EXCLUSIVAMENTE con JSON válido:
{"preguntas":[{"enunciado":"...","alternativas":[{"texto":"...","correcta":true|false}, ...4 en total]}]}
Sin ningún texto fuera del JSON.`;

const esquemaSalida = z.object({
  preguntas: z
    .array(
      z.object({
        enunciado: z.string().min(10),
        alternativas: z
          .array(z.object({ texto: z.string().min(1), correcta: z.boolean() }))
          .length(4)
          .refine((alts) => alts.filter((a) => a.correcta).length === 1, {
            message: "una correcta",
          }),
      })
    )
    .min(1),
});

export async function generarEnsayo(
  user: UsuarioIA,
  entrada: { asignaturaId: string; tipoEnsayo: "SIMCE" | "PAES"; cantidad: number }
): Promise<ResultadoEnsayo> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  const { asignaturaId, tipoEnsayo, cantidad } = z
    .object({
      asignaturaId: z.string().min(1),
      tipoEnsayo: z.enum(["SIMCE", "PAES"]),
      cantidad: z.number().int().min(3).max(15),
    })
    .parse(entrada);

  // La asignatura debe ser del colegio (el llamador ya validó el rol docente).
  const asignatura = await prisma.asignatura.findFirst({
    where: { id: asignaturaId, colegioId: user.colegioId },
    select: { nombre: true, curso: { select: { nivel: true, letra: true } } },
  });
  if (!asignatura) return { ok: false, error: "Asignatura no encontrada." };

  try {
    const cliente = clienteIA();
    const mensaje = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 6000,
        system: SISTEMA,
        messages: [
          {
            role: "user",
            content: `Genera ${cantidad} preguntas de ensayo ${tipoEnsayo} para la asignatura "${asignatura.nombre}", nivel ${asignatura.curso.nivel}º (Chile).`,
          },
        ],
      })
    );
    const texto = mensaje.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { ok: false, error: "La IA no devolvió preguntas válidas. Intenta de nuevo." };
    const salida = esquemaSalida.safeParse(JSON.parse(json));
    if (!salida.success) {
      return { ok: false, error: "Las preguntas generadas no pasaron la validación. Intenta de nuevo." };
    }

    // Todo o nada: preguntas al banco + quiz que las agrupa.
    const quiz = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const p of salida.data.preguntas.slice(0, cantidad)) {
        const creada = await tx.pregunta.create({
          data: {
            colegioId: user.colegioId,
            asignaturaId,
            tipo: "ALTERNATIVAS",
            enunciado: p.enunciado,
            puntaje: 1,
            autorId: user.id,
            alternativas: {
              create: p.alternativas.map((a, i) => ({ texto: a.texto, correcta: a.correcta, orden: i })),
            },
          },
          select: { id: true },
        });
        ids.push(creada.id);
      }
      return tx.quiz.create({
        data: {
          colegioId: user.colegioId,
          asignaturaId,
          titulo: `Ensayo ${tipoEnsayo} · ${asignatura.nombre}`,
          autorId: user.id,
          preguntas: { create: ids.map((preguntaId, orden) => ({ preguntaId, orden })) },
        },
        select: { id: true },
      });
    });

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "quiz:ensayo",
        entidadId: quiz.id,
        despues: { tipoEnsayo, cantidad, asignaturaId },
      });
    } catch {
      /* la auditoría no debe botar la generación */
    }

    return { ok: true, quizId: quiz.id, cantidad: Math.min(salida.data.preguntas.length, cantidad) };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}
