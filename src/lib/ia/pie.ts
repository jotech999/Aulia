import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { calcularPromedio, promedioGeneral, type ItemPromedio } from "@/lib/calificaciones";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";

/**
 * PIE CON IA — apoyo a la escritura del PACI y del informe a la familia
 * (Decreto 83/2015).
 *
 * Por qué existe: el Programa de Integración Escolar es la sección con más
 * papeleo de todo el colegio. El plan de adecuación curricular individual y el
 * informe semestral a la familia son horas de escritura por estudiante, y hasta
 * ahora la plataforma no ayudaba en nada con ellos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CUIDADOS ESPECIALES. Esta es la única función de Aulia que puede tocar datos
 * de SALUD, que la Ley 21.719 trata como categoría especial. Por eso el diseño
 * es más estricto que el del resto de `lib/ia`:
 *
 *  1. El texto clínico NO se lee solo desde la base y se despacha. Lo envía la
 *     profesional desde la pantalla, después de verlo y poder editarlo: quien
 *     conoce el caso decide qué sale y qué no. La plataforma no toma esa
 *     decisión en su nombre.
 *  2. NUNCA viaja la identidad: ni nombre, ni apellido, ni RUT, ni fecha de
 *     nacimiento. El texto se filtra otra vez aquí antes de salir, y al modelo
 *     se le habla siempre de "el/la estudiante".
 *  3. Los datos académicos que acompañan al caso son AGREGADOS (promedios,
 *     porcentaje de asistencia, asignaturas descendidas). Ninguna nota suelta.
 *  4. Nada se guarda: es un borrador que se muestra, se edita y se copia. La
 *     ficha solo cambia si la persona la escribe y la guarda como siempre.
 *  5. Solo ADMIN, DIRECTOR y PIE — el mismo alcance de la ficha — y cada uso
 *     queda auditado como CONSULTAR_IA, sin contenido clínico en la auditoría.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type UsuarioPie = { id: string; rol: string; colegioId: string };

/** Mismo alcance que la ficha PIE: no se amplía por venir desde la IA. */
export const ROLES_PIE_IA = new Set(["ADMIN", "DIRECTOR", "PIE"]);

export type Adecuacion = {
  ambito: string;
  propuesta: string;
  comoSeEvalua: string;
};

export type BorradorPaci = {
  sintesis: string;
  /** Adecuaciones de ACCESO (Decreto 83, art. 8). */
  acceso: Adecuacion[];
  /** Adecuaciones en los OBJETIVOS DE APRENDIZAJE (Decreto 83, art. 9). */
  objetivos: Adecuacion[];
  /** Acuerdos concretos para la casa. */
  trabajoConLaFamilia: string;
  /** Cuándo y cómo revisar si el plan está funcionando. */
  seguimiento: string;
};

export type ResultadoPaci = { ok: true; paci: BorradorPaci } | { ok: false; error: string };
export type ResultadoInformePie =
  | { ok: true; informe: string }
  | { ok: false; error: string };

/**
 * Segunda barrera sobre la identidad: aunque el texto lo revise una persona,
 * si trae "Nombre:", un RUT o una fecha de nacimiento se recorta antes de
 * salir. Es preferible perder una línea a filtrar un identificador.
 */
export function despersonalizar(texto: string): string {
  return texto
    .split("\n")
    .filter(
      (l) =>
        !/^\s*(nombre|nombres|apellidos?|rut|r\.u\.t|fecha de nacimiento|f\. ?nac)\b\s*:?/i.test(l)
    )
    .join("\n")
    .replace(/\b\d{1,2}[.\s]?\d{3}[.\s]?\d{3}\s*-\s*[\dkK]\b/g, "[RUT omitido]")
    .trim();
}

const SISTEMA = `Eres un asesor en educación inclusiva para equipos PIE de colegios chilenos, dentro de Aulia.
Trabajas con el Decreto 83/2015 (criterios y orientaciones de adecuación curricular) y el Decreto 170/2009.

Distingues con precisión los dos tipos de adecuación del Decreto 83:
- ADECUACIONES DE ACCESO: cambian la forma de presentar la información, de responder, el entorno físico y la organización del tiempo. NO cambian el objetivo de aprendizaje.
- ADECUACIONES EN LOS OBJETIVOS DE APRENDIZAJE: graduación del nivel de complejidad, priorización, temporalización, enriquecimiento o eliminación de aprendizajes. Son excepcionales, se justifican y se revisan.

REGLAS QUE NO PUEDES ROMPER:
- Nunca diagnosticas, nunca sugieres un diagnóstico, nunca recomiendas medicación ni tratamiento clínico. Eso es del equipo de salud, no de la escuela.
- Te basas solo en lo que te entregan. Si falta información para proponer algo, dilo en vez de rellenar.
- Escribes de "el/la estudiante": no usas nombres, aunque los recibieras por error.
- Propones adecuaciones OBSERVABLES y aplicables en una sala real chilena, con los recursos que un colegio tiene.
- Nunca anticipas si el/la estudiante pasará o repetirá de curso.
- Español de Chile, lenguaje profesional y respetuoso, siempre centrado en la persona (no "el TEA", sino "el/la estudiante").
El resultado es un BORRADOR que la profesional revisa, edita y firma. No es el plan definitivo.`;

const HERRAMIENTA_PACI: Anthropic.Tool = {
  name: "entregar_paci",
  description: "Entrega el borrador del plan de adecuación curricular individual.",
  input_schema: {
    type: "object",
    properties: {
      sintesis: {
        type: "string",
        description:
          "Síntesis de la situación educativa en 3 a 5 oraciones: qué necesita el/la estudiante para aprender, en términos pedagógicos y no clínicos.",
      },
      acceso: {
        type: "array",
        description:
          "Entre 3 y 6 adecuaciones DE ACCESO (presentación, formas de respuesta, entorno, organización del tiempo).",
        items: {
          type: "object",
          properties: {
            ambito: {
              type: "string",
              description: "Presentación de la información | Formas de respuesta | Entorno | Organización del tiempo y el horario.",
            },
            propuesta: { type: "string", description: "La adecuación concreta, aplicable en clases." },
            comoSeEvalua: {
              type: "string",
              description: "Cómo se verifica que está funcionando (evidencia observable).",
            },
          },
          required: ["ambito", "propuesta", "comoSeEvalua"],
        },
      },
      objetivos: {
        type: "array",
        description:
          "Entre 0 y 4 adecuaciones EN LOS OBJETIVOS DE APRENDIZAJE. Si con las de acceso basta, entrega una lista vacía y explícalo en la síntesis: son excepcionales.",
        items: {
          type: "object",
          properties: {
            ambito: {
              type: "string",
              description: "Graduación de la complejidad | Priorización | Temporalización | Enriquecimiento | Eliminación.",
            },
            propuesta: { type: "string", description: "La adecuación y en qué asignatura se aplica." },
            comoSeEvalua: { type: "string", description: "Criterio de logro y cuándo se revisa." },
          },
          required: ["ambito", "propuesta", "comoSeEvalua"],
        },
      },
      trabajoConLaFamilia: {
        type: "string",
        description: "2 a 4 acuerdos concretos y realistas con la familia, en lenguaje sencillo.",
      },
      seguimiento: {
        type: "string",
        description: "Cuándo revisar el plan y qué señales indicarían que hay que ajustarlo.",
      },
    },
    required: ["sintesis", "acceso", "objetivos", "trabajoConLaFamilia", "seguimiento"],
  },
};

/** Contexto académico agregado del estudiante. Sin nombre y sin notas sueltas. */
async function contextoAcademico(user: UsuarioPie, estudianteId: string) {
  const estudiante = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: user.colegioId },
    select: {
      id: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { cursoId: true, curso: { select: { nivel: true, letra: true } } },
        take: 1,
      },
    },
  });
  if (!estudiante) return null;

  const cursoId = estudiante.matriculas[0]?.cursoId;
  const curso = estudiante.matriculas[0]?.curso;
  if (!cursoId) return { nivel: null, promedio: null, asistencia: null, descendidas: [] as string[] };

  const [asignaturas, asistencias] = await Promise.all([
    prisma.asignatura.findMany({
      where: { cursoId, colegioId: user.colegioId },
      select: {
        nombre: true,
        evaluaciones: {
          where: { eliminadaEn: null, tipo: "SUMATIVA" },
          select: {
            ponderacion: true,
            calificaciones: {
              where: { estudianteId, eliminadaEn: null },
              select: { nota: true, eximida: true },
            },
          },
        },
      },
    }),
    prisma.asistenciaDiaria.findMany({
      where: { estudianteId, colegioId: user.colegioId },
      select: { estado: true },
      orderBy: { fecha: "desc" },
      take: 400,
    }),
  ]);

  const porAsignatura = asignaturas
    .map((a) => {
      const items: ItemPromedio[] = a.evaluaciones.map((e) => {
        const c = e.calificaciones[0];
        return {
          nota: c?.eximida ? null : (c?.nota ?? null),
          ponderacion: e.ponderacion,
          computa: !c?.eximida,
        };
      });
      return { nombre: a.nombre, promedio: calcularPromedio(items).promedio };
    })
    .filter((x): x is { nombre: string; promedio: number } => x.promedio !== null);

  const promedio = promedioGeneral(porAsignatura.map((x) => x.promedio));
  const descendidas = [...porAsignatura]
    .sort((a, b) => a.promedio - b.promedio)
    .filter((x) => x.promedio < 5)
    .slice(0, 4)
    .map((x) => `${x.nombre} (${x.promedio.toFixed(1)})`);

  const presentes = asistencias.filter((a) => a.estado !== "AUSENTE").length;
  const asistencia =
    asistencias.length > 0 ? Math.round((presentes / asistencias.length) * 100) : null;

  return {
    nivel: curso ? `${curso.nivel} ${curso.letra}` : null,
    promedio,
    asistencia,
    descendidas,
  };
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function adecuaciones(crudo: unknown, tope: number): Adecuacion[] {
  const lista = Array.isArray(crudo) ? crudo : [];
  return lista
    .slice(0, tope)
    .map((a) => {
      const o = a as Record<string, unknown>;
      return {
        ambito: texto(o.ambito, 120),
        propuesta: texto(o.propuesta, 900),
        comoSeEvalua: texto(o.comoSeEvalua, 600),
      };
    })
    .filter((a) => a.propuesta.length > 3);
}

/**
 * Borrador del PACI. `situacion` es el texto que la profesional revisó y decidió
 * enviar: la plataforma no lo saca por su cuenta de la ficha cifrada.
 */
export async function proponerPaci(
  user: UsuarioPie,
  entrada: { estudianteId: string; situacion: string; apoyosActuales?: string }
): Promise<ResultadoPaci> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  if (!ROLES_PIE_IA.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para usar esta herramienta." };
  }

  const situacion = despersonalizar(entrada.situacion).slice(0, 4000);
  if (situacion.length < 30) {
    return {
      ok: false,
      error:
        "Describe con un poco más de detalle qué necesita el/la estudiante para aprender: con menos que eso, cualquier propuesta sería inventada.",
    };
  }
  const apoyos = despersonalizar(entrada.apoyosActuales ?? "").slice(0, 2000);

  try {
    const ctx = await contextoAcademico(user, entrada.estudianteId);
    if (!ctx) return { ok: false, error: "Estudiante no encontrado en este colegio." };

    const datos = [
      ctx.nivel ? `Curso: ${ctx.nivel}` : "Sin curso activo registrado.",
      ctx.promedio !== null
        ? `Promedio general actual: ${ctx.promedio.toFixed(1)} (escala 1.0–7.0, se aprueba con 4.0)`
        : "Todavía no hay promedios registrados.",
      ctx.asistencia !== null ? `Asistencia registrada: ${ctx.asistencia}%` : null,
      ctx.descendidas.length > 0
        ? `Asignaturas más descendidas: ${ctx.descendidas.join(", ")}`
        : "Ninguna asignatura bajo 5.0.",
      "",
      "SITUACIÓN EDUCATIVA (redactada por la profesional del equipo PIE):",
      situacion,
      apoyos ? `\nAPOYOS QUE YA SE ENTREGAN:\n${apoyos}` : "",
    ]
      .filter((l) => l !== null)
      .join("\n");

    const prompt = `Propón el borrador de un Plan de Adecuación Curricular Individual (PACI) conforme al Decreto 83/2015 para este caso:

${datos}

Prioriza las adecuaciones DE ACCESO: son las que menos alteran el currículum y suelen bastar. Propón adecuaciones en los objetivos solo si el caso lo justifica, y explica por qué. Entrega el borrador con la herramienta entregar_paci.`;

    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 4000,
        system: SISTEMA,
        tools: [HERRAMIENTA_PACI],
        tool_choice: { type: "tool", name: "entregar_paci" },
        messages: [{ role: "user", content: prompt }],
      })
    );

    const bloque = respuesta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const x = (bloque?.input ?? {}) as Record<string, unknown>;
    const paci: BorradorPaci = {
      sintesis: texto(x.sintesis, 2000),
      acceso: adecuaciones(x.acceso, 8),
      objetivos: adecuaciones(x.objetivos, 6),
      trabajoConLaFamilia: texto(x.trabajoConLaFamilia, 1500),
      seguimiento: texto(x.seguimiento, 1200),
    };

    if (!paci.sintesis || paci.acceso.length === 0) {
      return { ok: false, error: "La IA no devolvió un plan válido. Intenta nuevamente." };
    }

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "borrador:paci",
        entidadId: entrada.estudianteId,
        // Se registra QUE se consultó y con cuánto detalle, jamás el contenido
        // clínico: la auditoría no puede convertirse en una segunda copia.
        despues: {
          adecuacionesAcceso: paci.acceso.length,
          adecuacionesObjetivos: paci.objetivos.length,
        },
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return { ok: true, paci };
  } catch (e) {
    console.error("[ia-paci]", e instanceof Error ? e.message : "error");
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}

/**
 * Informe a la familia. Habla de avances y acuerdos en lenguaje cotidiano —
 * el informe PIE lo lee una mamá, no un equipo técnico— y nunca en clave clínica.
 */
export async function redactarInformeFamilia(
  user: UsuarioPie,
  entrada: { estudianteId: string; periodo: string; avances: string }
): Promise<ResultadoInformePie> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  if (!ROLES_PIE_IA.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para usar esta herramienta." };
  }

  const avances = despersonalizar(entrada.avances).slice(0, 4000);
  if (avances.length < 20) {
    return { ok: false, error: "Cuenta brevemente qué se trabajó y qué avances hubo en el período." };
  }

  try {
    const ctx = await contextoAcademico(user, entrada.estudianteId);
    if (!ctx) return { ok: false, error: "Estudiante no encontrado en este colegio." };

    const sesiones = await prisma.sesionPie.count({
      where: {
        colegioId: user.colegioId,
        eliminadaEn: null,
        ficha: { estudianteId: entrada.estudianteId, eliminadaEn: null },
      },
    });
    const asistidas = await prisma.sesionPie.count({
      where: {
        colegioId: user.colegioId,
        eliminadaEn: null,
        asistio: true,
        ficha: { estudianteId: entrada.estudianteId, eliminadaEn: null },
      },
    });

    const prompt = `Redacta el informe del período "${entrada.periodo.slice(0, 60)}" que el equipo PIE entrega a la familia.

Datos acumulados del año escolar (agregados; NO están acotados al período indicado, así que no los presentes como si lo estuvieran):
${ctx.nivel ? `- Curso: ${ctx.nivel}` : ""}
${ctx.promedio !== null ? `- Promedio general: ${ctx.promedio.toFixed(1)}` : "- Aún sin promedios registrados."}
${ctx.asistencia !== null ? `- Asistencia a clases (últimos registros del año): ${ctx.asistencia}%` : ""}
- Sesiones de apoyo registradas en el año: ${sesiones}${sesiones > 0 ? ` (asistió a ${asistidas})` : ""}
${ctx.descendidas.length > 0 ? `- Asignaturas más descendidas: ${ctx.descendidas.join(", ")}` : ""}

Lo que reporta la profesional:
${avances}

Escribe el informe en español de Chile, dirigido a la familia y no a un equipo técnico, con esta estructura y sin encabezados burocráticos:
1) Cómo le ha ido este período (avances concretos, partiendo por lo logrado).
2) En qué se está trabajando y con qué apoyos.
3) Qué pueden hacer en la casa: 2 o 3 acciones concretas y realizables.
4) Cómo seguimos: próximos pasos y cuándo se vuelve a conversar.

Reglas: sin lenguaje clínico ni diagnósticos, sin nombres, sin promesas sobre promoción de curso, tono cálido y honesto. Entre 250 y 400 palabras. Es un borrador que la profesional editará y firmará.`;

    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 2000,
        system: SISTEMA,
        messages: [{ role: "user", content: prompt }],
      })
    );

    const informe = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!informe) {
      return { ok: false, error: "La IA no devolvió un informe válido. Intenta nuevamente." };
    }

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "borrador:informe-pie",
        entidadId: entrada.estudianteId,
        despues: { sesionesConsideradas: sesiones }, // sin contenido clínico
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return { ok: true, informe: informe.slice(0, 6000) };
  } catch (e) {
    console.error("[ia-informe-pie]", e instanceof Error ? e.message : "error");
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}
