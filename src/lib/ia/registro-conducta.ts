import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import type { UsuarioIA } from "./alcance";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * AGENTE DE REGISTROS DE CONDUCTA: convierte el apunte rápido del funcionario
 * ("molestó en clase, tercera vez esta semana") en el registro formal que exige
 * el libro: anotación objetiva o descripción de hechos para un caso de
 * convivencia, con lenguaje factual y sin juicios de valor.
 *
 * Cumplimiento: solo procesa el TEXTO que la persona escribe (sin consultar
 * datos de estudiantes); el resultado es SIEMPRE un borrador editable; se
 * instruye no incluir datos de salud ni de terceros identificables.
 */

export type ResultadoRedaccion =
  | { ok: true; texto: string }
  | { ok: false; error: string };

const SISTEMA_ANOTACION = `Redactas anotaciones para el libro de clases de un colegio chileno (hoja de vida del estudiante), dentro de Aulia.

REGLAS:
- Lenguaje FACTUAL y OBJETIVO: describe conductas observables, no juicios ("interrumpe la clase en tres ocasiones" y no "es desordenado").
- Tercera persona, tiempo pasado, español de Chile formal. SIN nombre del estudiante (el sistema lo asocia solo).
- Una anotación positiva destaca el logro concreto y su efecto; una negativa constata el hecho y, si el apunte lo menciona, la medida tomada (conversación, aviso al apoderado).
- 1 a 3 frases. Sin emojis, sin datos de salud, sin nombres de otros estudiantes (usa "un compañero/a").
- Responde EXCLUSIVAMENTE con JSON válido: {"texto": "..."}`;

const SISTEMA_ACTA = `Redactas la descripción de hechos de un caso de convivencia escolar en un colegio chileno (marco: Ley 20.536 de Violencia Escolar y reglamento interno), dentro de Aulia.

REGLAS:
- Relato FACTUAL, cronológico y neutro de los hechos: qué ocurrió, cuándo, dónde, quiénes intervinieron (por rol, no por nombre: "un estudiante de otro curso", "la profesora presente").
- SIN calificaciones jurídicas (no "agresión" si el apunte dice "empujón"), sin juicios de valor y presunción de inocencia: los hechos "se habrían producido" mientras no estén acreditados.
- Cierra indicando los pasos del debido proceso que corresponde activar según reglamento (notificar al apoderado, entrevistar a los involucrados, plazos), como lista breve.
- Español de Chile formal. Sin datos de salud ni nombres propios.
- Responde EXCLUSIVAMENTE con JSON válido: {"texto": "..."}`;

const esquema = z.object({ texto: z.string().min(10) });

async function redactar(
  user: UsuarioIA,
  sistema: string,
  entrada: string,
  entidad: string
): Promise<ResultadoRedaccion> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  const apunte = z.string().trim().min(5).max(1500).parse(entrada);
  try {
    const cliente = clienteIA();
    const mensaje = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 700,
        system: sistema,
        messages: [{ role: "user", content: `Apunte del funcionario: ${apunte}` }],
      })
    );
    const texto = mensaje.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { ok: false, error: "No se pudo redactar. Intenta de nuevo." };
    const salida = esquema.safeParse(JSON.parse(json));
    if (!salida.success) return { ok: false, error: "No se pudo redactar. Intenta de nuevo." };

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad,
        entidadId: user.id,
        despues: { herramienta: entidad }, // nunca el contenido
      });
    } catch {
      /* la auditoría no debe botar la redacción */
    }
    return { ok: true, texto: salida.data.texto };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}

/** Anotación formal (positiva/negativa/registro) desde un apunte rápido. */
export async function redactarAnotacion(
  user: UsuarioIA,
  entrada: { apunte: string; tipo: "POSITIVA" | "NEGATIVA" | "NEUTRA" }
): Promise<ResultadoRedaccion> {
  const tipoTxt =
    entrada.tipo === "POSITIVA" ? "ANOTACIÓN POSITIVA" : entrada.tipo === "NEGATIVA" ? "ANOTACIÓN NEGATIVA" : "REGISTRO NEUTRO";
  return redactar(user, SISTEMA_ANOTACION, `[${tipoTxt}] ${entrada.apunte}`, "ia:anotacion");
}

/** Descripción de hechos + pasos de debido proceso para un caso de convivencia. */
export async function redactarActaConvivencia(
  user: UsuarioIA,
  entrada: { apunte: string }
): Promise<ResultadoRedaccion> {
  return redactar(user, SISTEMA_ACTA, entrada.apunte, "ia:acta-convivencia");
}
