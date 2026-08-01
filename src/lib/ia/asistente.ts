import type Anthropic from "@anthropic-ai/sdk";
import { clienteIA, IA_MODELO, conReintento } from "./cliente";
import { HERRAMIENTAS, ejecutarHerramienta } from "./herramientas";
import type { UsuarioIA } from "./alcance";
import { registrarAuditoria } from "@/lib/auditoria";

export type MensajeChat = { rol: "user" | "assistant"; texto: string };

const MAX_ITERACIONES = 6;

const ROL_CONTEXTO: Record<string, string> = {
  ADMIN: "administrador del establecimiento (visión de todo el colegio)",
  DIRECTOR: "director (visión estratégica e institucional de todo el colegio)",
  UTP: "jefe de UTP (foco en planificación, cobertura y resultados de todo el colegio)",
  PROFESOR_JEFE: "profesor jefe (foco en su curso de jefatura y sus asignaturas)",
  PROFESOR: "profesor de asignatura (foco en sus cursos y su jornada)",
  INSPECTOR: "inspector (foco en asistencia, atrasos y convivencia operativa)",
  APODERADO: "apoderado (solo puede consultar a sus pupilos, lenguaje cotidiano)",
};

function systemPrompt(user: UsuarioIA & { nombre?: string | null; colegioNombre?: string }) {
  const contexto = ROL_CONTEXTO[user.rol] ?? user.rol;
  return `Eres AULI, la mascota y asistente de Aulia: una pizarrita con ojos, cercana y ordenada. Aulia es una plataforma de gestión escolar chilena. Ayudas a ${
    user.nombre ?? "un usuario"
  }, cuyo rol es: ${contexto}. Establecimiento: ${user.colegioNombre ?? "su colegio"}. Habla en primera persona como Auli (con calidez y sin exagerar el personaje: nada de "¡tiza!" ni muletillas infantiles; profesionalismo cercano).

REGLAS ESTRICTAS (cumplimiento Circular 30 y Ley 21.719):
- Eres de SOLO LECTURA. NO registras asistencia, notas, anotaciones ni matrículas. Si te lo piden, explica que esa acción la debe hacer una persona con el rol competente en el módulo correspondiente; tú puedes ayudar a redactar un borrador.
- Responde ÚNICAMENTE con datos obtenidos de las herramientas. Nunca inventes cifras, nombres ni estados. Si una herramienta no devuelve datos o el usuario no tiene acceso, dilo con claridad.
- Nunca reveles ni pidas RUT, datos de salud, contacto o dirección. No tienes acceso a esa información y no debes solicitarla.
- Respeta el alcance del usuario: las herramientas ya filtran lo que puede ver. Si algo queda fuera de su alcance, indícalo sin especular.
- Sé breve, claro y cercano. Usa la escala de notas 1.0–7.0 y el contexto escolar chileno. Para el apoderado, evita jerga interna.
- Cuando redactes un borrador de comunicado u observación, indícalo como borrador que la persona debe revisar y enviar.

Usa las herramientas para buscar estudiantes por nombre, listar cursos, resumir asistencia, revisar alertas de riesgo, ver la ficha académica mínima de un estudiante, revisar los pendientes operativos (clases sin firmar, listas sin pasar, evaluaciones sin notas), consultar el horario de HOY del docente (horario_hoy), ver las próximas evaluaciones agendadas (proximas_evaluaciones) y, para apoderados, sus comunicados sin leer (comunicados_pendientes).

ERES TAMBIÉN EL GUÍA DE AULIA: si el usuario pregunta cómo hacer algo en la plataforma (pasar lista, poner notas, firmar el leccionario, enviar un comunicado, crear una evaluación, matricular, exportar a SIGE), explícale el paso a paso con el nombre del módulo del menú donde se hace. Si pregunta "¿qué me falta?" o "¿cómo vengo?", usa pendientes_operativos y respóndele como un jefe de estudios ordenado: qué está al día, qué falta y por dónde partir.`;
}

async function auditar(user: UsuarioIA, a: NonNullable<Awaited<ReturnType<typeof ejecutarHerramienta>>["auditar"]>) {
  try {
    await registrarAuditoria({
      colegioId: user.colegioId,
      usuarioId: user.id,
      accion: "CONSULTAR_IA",
      entidad: a.entidad,
      entidadId: a.entidadId.slice(0, 500),
      despues: a.meta, // metadatos, sin PII
    });
  } catch {
    // La auditoría no debe romper la respuesta; el fallo se ignora silenciosamente.
  }
}

/**
 * Ejecuta un turno del asistente: corre el bucle de tool-use en el servidor,
 * reautorizando y auditando cada acceso a datos de estudiantes, y devuelve el
 * texto final del modelo.
 */
export async function responderAsistente(
  user: UsuarioIA & { nombre?: string | null; colegioNombre?: string },
  historial: MensajeChat[]
): Promise<{ respuesta: string; herramientas: string[] }> {
  const cliente = clienteIA();
  const herramientasUsadas: string[] = [];

  const messages: Anthropic.MessageParam[] = historial.map((m) => ({
    role: m.rol,
    content: m.texto,
  }));

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 1024,
        system: systemPrompt(user),
        tools: HERRAMIENTAS,
        messages,
      })
    );

    if (respuesta.stop_reason !== "tool_use") {
      const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return {
        respuesta: texto || "No pude generar una respuesta. Intenta reformular tu pregunta.",
        herramientas: herramientasUsadas,
      };
    }

    // Ejecutar todas las herramientas solicitadas y devolver los resultados.
    messages.push({ role: "assistant", content: respuesta.content });
    const resultados: Anthropic.ToolResultBlockParam[] = [];

    for (const bloque of respuesta.content) {
      if (bloque.type !== "tool_use") continue;
      herramientasUsadas.push(bloque.name);
      try {
        const { salida, auditar: aud } = await ejecutarHerramienta(
          user,
          bloque.name,
          bloque.input
        );
        if (aud) await auditar(user, aud);
        resultados.push({
          type: "tool_result",
          tool_use_id: bloque.id,
          content: JSON.stringify(salida),
        });
      } catch {
        resultados.push({
          type: "tool_result",
          tool_use_id: bloque.id,
          content: JSON.stringify({ error: "No se pudo completar la consulta." }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: resultados });
  }

  return {
    respuesta:
      "La consulta resultó demasiado compleja. Intenta dividirla en preguntas más simples.",
    herramientas: herramientasUsadas,
  };
}
