import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { whereAsignaturasAccesibles } from "@/app/(dashboard)/planificacion/consultas";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";

/**
 * ANÁLISIS DE UNA EVALUACIÓN — cierra el ciclo evaluar → volver a enseñar.
 *
 * Hasta ahora el recorrido moría al poner las notas: la plataforma guardaba el
 * número y nadie le decía a la persona docente QUÉ no se entendió ni qué hacer
 * la clase siguiente. El análisis del curso que ya existía mira la asignatura
 * completa; este mira UNA prueba y baja al detalle:
 *
 *  - la distribución real de notas de esa evaluación y su contraste con el
 *    resto de la asignatura (¿fue esta prueba o viene de antes?);
 *  - cuando se aplicó una rúbrica, el porcentaje de logro CRITERIO POR CRITERIO,
 *    que es la única evidencia fina de qué falló;
 *  - los OA asociados al instrumento.
 *
 * Y devuelve una clase de refuerzo lista para revisar y guardar en la
 * planificación, que es lo que realmente le ahorra la tarde a un profesor.
 *
 * Cumplimiento (Ley 21.719 · Circular 30), igual que el resto de `lib/ia`:
 *  - Al modelo van solo AGREGADOS: promedios, conteos y porcentajes. Ningún
 *    nombre, RUT ni nota individual. La lista de estudiantes a acompañar la
 *    calcula y muestra la propia plataforma, sin pasar por el modelo.
 *  - Es un BORRADOR. No guarda ni publica nada por su cuenta.
 *  - Reautoriza el acceso a la asignatura (multi-tenant) y audita CONSULTAR_IA.
 */

export type UsuarioAnalisis = { id: string; rol: string; colegioId: string };

export type FocoRefuerzo = {
  titulo: string;
  evidencia: string;
  accion: string;
};

export type ClaseRefuerzo = {
  titulo: string;
  objetivo: string;
  inicio: string;
  desarrollo: string;
  cierre: string;
  comoSaberSiResulto: string;
};

export type AnalisisEvaluacion = {
  lectura: string;
  focos: FocoRefuerzo[];
  clase: ClaseRefuerzo;
  /** Datos duros que se muestran junto al análisis (calculados, no generados). */
  cifras: {
    conNota: number;
    sinNota: number;
    promedio: number | null;
    reprobados: number;
    distribucion: { rango: string; n: number }[];
    promedioAsignatura: number | null;
    criterios: { descripcion: string; logro: number }[];
    oas: string[];
  };
};

export type ResultadoAnalisisEvaluacion =
  | { ok: true; analisis: AnalisisEvaluacion }
  | { ok: false; error: string };

const HERRAMIENTA: Anthropic.Tool = {
  name: "entregar_analisis",
  description: "Entrega el análisis de la evaluación y la clase de refuerzo propuesta.",
  input_schema: {
    type: "object",
    properties: {
      lectura: {
        type: "string",
        description:
          "Lectura pedagógica de la evaluación en 3 a 5 oraciones: qué logró el curso, qué no, y si el problema parece de esta evaluación o arrastrado. Habla del curso, nunca de estudiantes concretos.",
      },
      focos: {
        type: "array",
        description: "Entre 2 y 4 focos de refuerzo, ordenados por urgencia.",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "El aprendizaje a reforzar, en pocas palabras." },
            evidencia: {
              type: "string",
              description:
                "Qué dato concreto de los entregados sustenta este foco (cita la cifra). Si no hay evidencia suficiente, dilo.",
            },
            accion: {
              type: "string",
              description: "Qué hacer en clases para remediarlo, concreto y realizable.",
            },
          },
          required: ["titulo", "evidencia", "accion"],
        },
      },
      clase: {
        type: "object",
        description: "Una clase de refuerzo de 45 minutos, lista para llevar al aula.",
        properties: {
          titulo: { type: "string", description: "Título breve de la clase." },
          objetivo: {
            type: "string",
            description: "Objetivo de aprendizaje de la clase, redactado como se escribe en la planificación chilena.",
          },
          inicio: { type: "string", description: "Inicio (10 min): activación y motivación." },
          desarrollo: { type: "string", description: "Desarrollo (25 min): actividad principal, paso a paso." },
          cierre: { type: "string", description: "Cierre (10 min): síntesis y metacognición." },
          comoSaberSiResulto: {
            type: "string",
            description: "Evaluación formativa breve: qué mirar al final para saber si se logró.",
          },
        },
        required: ["titulo", "objetivo", "inicio", "desarrollo", "cierre", "comoSaberSiResulto"],
      },
    },
    required: ["lectura", "focos", "clase"],
  },
};

const SISTEMA = `Eres un asesor pedagógico para docentes de colegios chilenos, dentro de Aulia.
Analizas los resultados de UNA evaluación y propones cómo volver a enseñar lo que no se logró.
Escribes en español de Chile, con lenguaje profesional y cercano, sin jerga innecesaria.
Reglas que no puedes romper:
- Te basas ÚNICAMENTE en las cifras entregadas. No inventas datos, causas ni nombres.
- Si la evidencia es escasa (pocas notas, sin rúbrica aplicada), lo dices con franqueza en vez de rellenar.
- Nunca te refieres a estudiantes concretos: trabajas con el curso como grupo.
- Nunca anticipas ni estimas si alguien pasará o repetirá de curso.
- La escala es 1.0 a 7.0 y se aprueba con 4.0.
El resultado es un BORRADOR que la persona docente revisa, edita y decide si usa.`;

function promedioDe(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function analizarEvaluacion(
  user: UsuarioAnalisis,
  evaluacionId: string
): Promise<ResultadoAnalisisEvaluacion> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }

  try {
    // Autorización: la evaluación debe pertenecer a una asignatura que esta
    // persona puede ver. Se re-comprueba aquí y no solo en la interfaz.
    const ev = await prisma.evaluacion.findFirst({
      where: {
        id: evaluacionId,
        eliminadaEn: null,
        asignatura: whereAsignaturasAccesibles(user),
      },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        contenidos: true,
        fecha: true,
        asignaturaId: true,
        asignatura: {
          select: {
            nombre: true,
            curso: { select: { nivel: true, letra: true } },
          },
        },
        calificaciones: {
          where: { eliminadaEn: null },
          select: { nota: true, eximida: true },
        },
        rubrica: {
          select: {
            nombre: true,
            criterios: {
              select: { id: true, descripcion: true, puntajeMax: true },
              orderBy: { orden: "asc" },
            },
            oas: { select: { oa: { select: { codigo: true, descripcion: true } } } },
          },
        },
      },
    });
    if (!ev) return { ok: false, error: "No tienes acceso a esa evaluación." };

    const notas = ev.calificaciones
      .filter((c) => !c.eximida && typeof c.nota === "number")
      .map((c) => c.nota as number);
    const sinNota = ev.calificaciones.length - notas.length;

    if (notas.length < 3) {
      return {
        ok: false,
        error:
          "Aún hay muy pocas notas en esta evaluación para leer algo con sentido. Termina de calificar y vuelve.",
      };
    }

    const promedio = promedioDe(notas);
    const reprobados = notas.filter((n) => n < 4).length;
    const banda = (lo: number, hi: number) => notas.filter((n) => n >= lo && n < hi).length;
    const distribucion = [
      { rango: "1.0–3.9", n: banda(1, 4) },
      { rango: "4.0–4.9", n: banda(4, 5) },
      { rango: "5.0–5.9", n: banda(5, 6) },
      { rango: "6.0–7.0", n: banda(6, 7.1) },
    ];

    // Contraste con el resto de la asignatura: distingue "esta prueba salió
    // mal" de "este curso viene arrastrando un problema".
    const otras = await prisma.calificacion.findMany({
      where: {
        eliminadaEn: null,
        eximida: false,
        nota: { not: null },
        evaluacion: {
          asignaturaId: ev.asignaturaId,
          eliminadaEn: null,
          tipo: "SUMATIVA",
          id: { not: ev.id },
        },
      },
      select: { nota: true },
      // Orden explícito: sin él, pasadas las 2000 filas Postgres devolvería un
      // subconjunto distinto en cada corrida y el promedio de referencia
      // bailaría entre análisis de la misma evaluación.
      orderBy: { creadaEn: "desc" },
      take: 2000,
    });
    const promedioAsignatura = promedioDe(
      otras.map((c) => c.nota as number).filter((n) => typeof n === "number")
    );

    /*
     * Logro por criterio. Es la evidencia más fina que tiene la plataforma: sin
     * rúbrica aplicada solo se sabe "la nota fue baja"; con ella se sabe QUÉ
     * dimensión falló. Se usan únicamente las aplicaciones FINALIZADAS y no
     * anuladas: un borrador a medio corregir daría un porcentaje falso.
     */
    let criterios: { descripcion: string; logro: number }[] = [];
    if (ev.rubrica && ev.rubrica.criterios.length > 0) {
      const puntajes = await prisma.puntajeCriterioRubrica.findMany({
        where: {
          colegioId: user.colegioId,
          aplicacion: {
            evaluacionId: ev.id,
            estado: "FINALIZADA",
            anuladaEn: null,
          },
        },
        select: { criterioId: true, puntaje: true },
      });
      const porCriterio = new Map<string, number[]>();
      for (const p of puntajes) {
        const lista = porCriterio.get(p.criterioId) ?? [];
        lista.push(Number(p.puntaje));
        porCriterio.set(p.criterioId, lista);
      }
      criterios = ev.rubrica.criterios
        .map((c) => {
          const obtenidos = porCriterio.get(c.id) ?? [];
          const max = Number(c.puntajeMax);
          const prom = promedioDe(obtenidos);
          if (prom === null || !(max > 0)) return null;
          return {
            descripcion: c.descripcion,
            logro: Math.round((prom / max) * 100),
          };
        })
        .filter((c): c is { descripcion: string; logro: number } => c !== null)
        .sort((a, b) => a.logro - b.logro);
    }

    const oas = (ev.rubrica?.oas ?? []).map((r) => `${r.oa.codigo} — ${r.oa.descripcion}`);

    const cifras: AnalisisEvaluacion["cifras"] = {
      conNota: notas.length,
      sinNota,
      promedio,
      reprobados,
      distribucion,
      promedioAsignatura,
      criterios,
      oas,
    };

    // Lo que efectivamente viaja al modelo: agregados, nada más.
    const datos = [
      `Evaluación: "${ev.nombre}" (${ev.tipo === "FORMATIVA" ? "formativa" : "sumativa"})`,
      `Asignatura: ${ev.asignatura.nombre} · Curso ${ev.asignatura.curso.nivel} ${ev.asignatura.curso.letra}`,
      ev.contenidos ? `Contenidos declarados: ${ev.contenidos.slice(0, 600)}` : null,
      `Estudiantes con nota: ${notas.length}${sinNota > 0 ? ` (quedan ${sinNota} sin calificar)` : ""}`,
      `Promedio de la evaluación: ${promedio !== null ? promedio.toFixed(1) : "—"}`,
      `Reprobados (bajo 4.0): ${reprobados} de ${notas.length} (${Math.round((reprobados / notas.length) * 100)}%)`,
      `Distribución: ${distribucion.map((d) => `${d.rango}: ${d.n}`).join(" · ")}`,
      promedioAsignatura !== null
        ? `Promedio del resto de las evaluaciones sumativas de la asignatura: ${promedioAsignatura.toFixed(1)}`
        : "No hay otras evaluaciones sumativas con notas para comparar.",
      criterios.length > 0
        ? `Logro por criterio de la rúbrica aplicada (porcentaje del puntaje máximo, de menor a mayor):\n${criterios
            .map((c) => `  - ${c.descripcion}: ${c.logro}%`)
            .join("\n")}`
        : "No se aplicó una rúbrica a esta evaluación, así que no hay detalle por criterio: el análisis debe reconocer esa limitación.",
      oas.length > 0 ? `Objetivos de aprendizaje del instrumento:\n${oas.map((o) => `  - ${o}`).join("\n")}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Analiza los resultados de esta evaluación y propone cómo volver a enseñar lo que no se logró.

${datos}

Entrega el análisis mediante la herramienta entregar_analisis. La clase de refuerzo debe durar 45 minutos y apuntar al foco más urgente que hayas identificado.`;

    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 3000,
        system: SISTEMA,
        tools: [HERRAMIENTA],
        tool_choice: { type: "tool", name: "entregar_analisis" },
        messages: [{ role: "user", content: prompt }],
      })
    );

    const bloque = respuesta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const x = (bloque?.input ?? {}) as Record<string, unknown>;

    const lectura = texto(x.lectura, 2000);
    const focosCrudos = Array.isArray(x.focos) ? x.focos : [];
    const focos: FocoRefuerzo[] = focosCrudos
      .slice(0, 6)
      .map((f) => {
        const o = f as Record<string, unknown>;
        return {
          titulo: texto(o.titulo, 160),
          evidencia: texto(o.evidencia, 600),
          accion: texto(o.accion, 800),
        };
      })
      .filter((f) => f.titulo && f.accion);

    const c = (x.clase ?? {}) as Record<string, unknown>;
    const clase: ClaseRefuerzo = {
      titulo: texto(c.titulo, 160),
      objetivo: texto(c.objetivo, 600),
      inicio: texto(c.inicio, 1200),
      desarrollo: texto(c.desarrollo, 2500),
      cierre: texto(c.cierre, 1200),
      comoSaberSiResulto: texto(c.comoSaberSiResulto, 800),
    };

    if (!lectura || focos.length === 0 || !clase.objetivo) {
      return { ok: false, error: "La IA no devolvió un análisis válido. Intenta nuevamente." };
    }

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "borrador:analisis-evaluacion",
        entidadId: ev.id,
        // Sin PII: qué se analizó y con cuánta evidencia, no quién ni con qué nota.
        despues: {
          asignaturaId: ev.asignaturaId,
          conNota: notas.length,
          conRubrica: criterios.length > 0,
        },
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return { ok: true, analisis: { lectura, focos, clase, cifras } };
  } catch (e) {
    console.error("[ia-analisis-evaluacion]", e instanceof Error ? e.message : "error");
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}
