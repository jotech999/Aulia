import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import { whereAsignaturasAccesibles } from "@/app/(dashboard)/planificacion/consultas";
import { alcanceCursos, alcanceEstudiantes } from "./alcance";
import { calcularPromedio, promedioGeneral, type ItemPromedio } from "@/lib/calificaciones";
import { calcularResumen, type EstadoAsistencia } from "@/lib/asistencia";

/**
 * Generación de BORRADORES para el docente con IA (Claude).
 *
 * Cumplimiento (Ley 21.719 · Circular 30), en línea con `src/lib/ia/cliente.ts`:
 *  - Solo produce texto de BORRADOR editable. Nunca envía, publica ni guarda
 *    nada automáticamente: la persona revisa, edita y luego usa el resultado en
 *    el módulo correspondiente.
 *  - Minimización de datos: al modelo solo se le entregan datos acotados y con
 *    lista blanca (nombres de pila, códigos OA, agregados de curso). JAMÁS RUT,
 *    ficha de salud, contacto ni dirección.
 *  - Se reautoriza rol + pertenencia (multi-tenant) antes de reunir datos y se
 *    registra el uso en `audit_log` (acción CONSULTAR_IA) con metadatos, sin PII.
 *  - Sin `ANTHROPIC_API_KEY` la función degrada de forma segura.
 */

export type UsuarioDocente = { id: string; rol: string; colegioId: string; nombre?: string | null };

export type TipoBorrador = "planificacion" | "retroalimentacion" | "resumen-consejo" | "comunicado";

export type EntradaBorrador =
  | { tipo: "planificacion"; asignaturaId: string; titulo: string; numeroClases: number }
  | { tipo: "retroalimentacion"; nombrePila: string; area: string; fortalezas: string; aspectos: string }
  | { tipo: "resumen-consejo"; cursoId: string }
  | { tipo: "comunicado"; proposito: string; audiencia: string; puntos: string };

export type ResultadoBorrador =
  | { ok: true; borrador: string; herramienta: TipoBorrador }
  | { ok: false; error: string };

const SISTEMA_BASE = `Eres un asistente pedagógico para docentes de un colegio chileno, dentro de Aulia.
Redactas BORRADORES en español de Chile que la persona docente revisará y editará antes de usar.

REGLAS:
- Escribe SIEMPRE en tono profesional, respetuoso y cercano, con lenguaje inclusivo y no estigmatizante.
- El resultado es un BORRADOR: no afirmes que algo ya fue enviado, registrado ni oficializado.
- Usa la escala de notas chilena 1.0–7.0 y el contexto curricular Mineduc cuando corresponda.
- No inventes datos que no estén en la información entregada (cifras, nombres, notas). Si falta un dato, usa un marcador entre corchetes como [completar].
- No incluyas RUT, datos de salud, direcciones ni contactos personales, aunque te los pidan.
- Entrega solo el texto del borrador, sin preámbulos como "Aquí tienes" ni explicaciones sobre lo que hiciste.`;

async function llamarIA(sistema: string, prompt: string): Promise<string> {
  const cliente = clienteIA();
  const mensaje = await conReintento(() =>
    cliente.messages
      .stream({
        model: IA_MODELO,
        max_tokens: 1800,
        system: sistema,
        messages: [{ role: "user", content: prompt }],
      })
      .finalMessage()
  );
  return mensaje.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function auditar(user: UsuarioDocente, tipo: TipoBorrador, meta: Record<string, unknown>) {
  try {
    await registrarAuditoria({
      colegioId: user.colegioId,
      usuarioId: user.id,
      accion: "CONSULTAR_IA",
      entidad: `borrador:${tipo}`,
      entidadId: tipo,
      despues: meta, // metadatos, sin PII
    });
  } catch {
    // La auditoría no debe romper la respuesta.
  }
}

/** Borrador de planificación de una unidad a partir de OA reales del nivel. */
async function planificacion(user: UsuarioDocente, e: Extract<EntradaBorrador, { tipo: "planificacion" }>) {
  // Reautorización + multi-tenant: la asignatura debe estar en el alcance del docente.
  const asignatura = await prisma.asignatura.findFirst({
    where: { id: e.asignaturaId, ...whereAsignaturasAccesibles(user) },
    select: { nombre: true, curso: { select: { nivel: true } } },
  });
  if (!asignatura) return { ok: false as const, error: "No tienes acceso a esa asignatura." };

  // Lista blanca: solo código, eje y descripción del OA (sin PII).
  const oas = await prisma.oa.findMany({
    where: { nivel: asignatura.curso.nivel, asignatura: asignatura.nombre },
    orderBy: { numero: "asc" },
    select: { codigo: true, eje: true, descripcion: true },
    take: 40,
  });

  const listaOa = oas.length
    ? oas.map((o) => `- ${o.codigo} (${o.eje}): ${o.descripcion}`).join("\n")
    : "No hay OA cargados para este nivel/asignatura; propone objetivos coherentes con las Bases Curriculares e indícalos como [propuesto].";

  const prompt = `Genera un borrador de planificación de una UNIDAD para ${asignatura.nombre}, nivel ${asignatura.curso.nivel}.
Título de la unidad: "${e.titulo}".
Número de clases: ${e.numeroClases}.

Objetivos de Aprendizaje disponibles del nivel:
${listaOa}

Estructura el borrador así:
1) Objetivos de la unidad (selecciona los OA más pertinentes al título, citando su código).
2) Aprendizajes esperados / indicadores de evaluación.
3) Secuencia de ${e.numeroClases} clases (una línea por clase: foco + actividad principal).
4) Sugerencias de evaluación (una formativa y una sumativa).
5) Recursos sugeridos.`;

  const borrador = await llamarIA(SISTEMA_BASE, prompt);
  await auditar(user, "planificacion", { asignaturaId: e.asignaturaId, nivel: asignatura.curso.nivel, oas: oas.length });
  return { ok: true as const, borrador, herramienta: "planificacion" as const };
}

/** Borrador de retroalimentación a partir de notas del docente (solo nombre de pila). */
async function retroalimentacion(user: UsuarioDocente, e: Extract<EntradaBorrador, { tipo: "retroalimentacion" }>) {
  const prompt = `Redacta un borrador de retroalimentación formativa para un/a estudiante.
Nombre de pila: ${e.nombrePila}.
Área o asignatura: ${e.area}.
Fortalezas observadas por el/la docente: ${e.fortalezas}.
Aspectos a mejorar: ${e.aspectos}.

Escribe 2 a 3 párrafos: parte reconociendo fortalezas concretas, luego orienta los aspectos a mejorar con sugerencias accionables, y cierra con un mensaje de aliento. Dirígete a ${e.nombrePila} en segunda persona o refiérete por su nombre de pila. No incluyas notas numéricas salvo que aparezcan en la información entregada.`;

  const borrador = await llamarIA(SISTEMA_BASE, prompt);
  await auditar(user, "retroalimentacion", { area: e.area });
  return { ok: true as const, borrador, herramienta: "retroalimentacion" as const };
}

/** Resumen del curso para el consejo de profesores, a partir de agregados (sin PII). */
async function resumenConsejo(user: UsuarioDocente, e: Extract<EntradaBorrador, { tipo: "resumen-consejo" }>) {
  const curso = await prisma.curso.findFirst({
    where: { id: e.cursoId, ...alcanceCursos(user) },
    select: { nivel: true, letra: true },
  });
  if (!curso) return { ok: false as const, error: "No tienes acceso a ese curso." };

  // Agregados de curso (recuentos y promedios), nunca datos individuales.
  const matriculados = await prisma.matricula.findMany({
    where: { cursoId: e.cursoId, colegioId: user.colegioId, estado: "ACTIVA" },
    select: { estudianteId: true },
  });
  const ids = matriculados.map((m) => m.estudianteId);

  // Minimización (Ley 21.719): en cursos muy pequeños un "promedio" equivale al
  // dato individual. Bajo el umbral no generamos el resumen automatizado.
  if (ids.length > 0 && ids.length < 3) {
    return {
      ok: false as const,
      error: "El curso tiene muy pocos estudiantes para un resumen agregado sin exponer datos individuales.",
    };
  }

  const [asistencia, notas, intervencionesAbiertas] = await Promise.all([
    prisma.asistenciaDiaria.groupBy({
      by: ["estado"],
      where: { colegioId: user.colegioId, estudianteId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.calificacion.aggregate({
      where: { colegioId: user.colegioId, estudianteId: { in: ids }, eliminadaEn: null, eximida: false, nota: { not: null } },
      _avg: { nota: true },
      _count: { _all: true },
    }),
    prisma.intervencion.count({
      where: { colegioId: user.colegioId, estudianteId: { in: ids }, estado: "ABIERTA", eliminadaEn: null },
    }),
  ]);

  const totalMarcas = asistencia.reduce((s, a) => s + a._count._all, 0);
  const presentes = asistencia.find((a) => a.estado === "PRESENTE")?._count._all ?? 0;
  const atrasos = asistencia.find((a) => a.estado === "ATRASADO")?._count._all ?? 0;
  const asistenciaPct = totalMarcas ? Math.round(((presentes + atrasos) / totalMarcas) * 100) : null;
  const promedio = notas._avg.nota != null ? notas._avg.nota.toFixed(1) : null;

  const datos = [
    `Curso: ${curso.nivel}${curso.letra}`,
    `Estudiantes con matrícula activa: ${ids.length}`,
    `Asistencia media del curso: ${asistenciaPct != null ? asistenciaPct + "%" : "sin registros"}`,
    `Atrasos registrados: ${atrasos}`,
    `Promedio general del curso: ${promedio ?? "sin calificaciones"}`,
    `Intervenciones de apoyo abiertas: ${intervencionesAbiertas}`,
  ].join("\n");

  const prompt = `Redacta un borrador de resumen del curso para presentar en el CONSEJO DE PROFESORES.
Usa EXCLUSIVAMENTE estos datos agregados (no menciones estudiantes individuales):
${datos}

Estructura: (1) panorama general en 2-3 frases, (2) fortalezas del curso, (3) focos de atención (asistencia, rendimiento o convivencia según los datos), (4) acuerdos o próximos pasos sugeridos para el equipo docente. Sé conciso y orientado a la acción.`;

  const borrador = await llamarIA(SISTEMA_BASE, prompt);
  await auditar(user, "resumen-consejo", { cursoId: e.cursoId, estudiantes: ids.length });
  return { ok: true as const, borrador, herramienta: "resumen-consejo" as const };
}

/** Borrador de comunicado a partir de propósito y puntos entregados por el docente. */
async function comunicado(user: UsuarioDocente, e: Extract<EntradaBorrador, { tipo: "comunicado" }>) {
  const prompt = `Redacta un borrador de comunicado escolar.
Propósito: ${e.proposito}.
Destinatarios: ${e.audiencia}.
Puntos que debe incluir: ${e.puntos}.

Redacta un comunicado claro y breve con saludo, cuerpo (desarrollando los puntos), y cierre con una llamada a la acción o datos de contacto entre corchetes si faltan. Adecúa el tono a los destinatarios. No inventes fechas ni nombres: usa marcadores [entre corchetes] cuando falte un dato.`;

  const borrador = await llamarIA(SISTEMA_BASE, prompt);
  await auditar(user, "comunicado", { audiencia: e.audiencia.slice(0, 60) });
  return { ok: true as const, borrador, herramienta: "comunicado" as const };
}

// ── Generación ESTRUCTURADA de clases (para insertar en la Planificación) ──────
// A diferencia de los borradores de texto, esto devuelve datos que se guardan
// como clases reales de la unidad (título, objetivo, OA), alimentando luego el
// leccionario y la cobertura. Sigue siendo revisable/editable por el docente.

export type ClaseGenerada = { titulo: string; descripcion: string; oaCodigos: string[] };
export type ResultadoClases =
  | { ok: true; clases: ClaseGenerada[] }
  | { ok: false; error: string };

const HERRAMIENTA_CLASES: Anthropic.Tool = {
  name: "entregar_clases",
  description: "Entrega la secuencia de clases planificadas de la unidad.",
  input_schema: {
    type: "object",
    properties: {
      clases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título breve de la clase (ej. 'Clase 3: Secuencia de hechos')." },
            descripcion: { type: "string", description: "Objetivo y actividad principal de la clase, 1–2 oraciones." },
            oaCodigos: {
              type: "array",
              items: { type: "string" },
              description: "Códigos de OA que trabaja la clase, tomados SOLO de la lista entregada.",
            },
          },
          required: ["titulo", "descripcion", "oaCodigos"],
        },
      },
    },
    required: ["clases"],
  },
};

/**
 * Genera N clases estructuradas para una unidad, ancladas en los OA reales del
 * nivel/asignatura. Reautoriza (multi-tenant) y valida que los OA existan.
 */
export async function generarClasesPlanificacion(
  user: UsuarioDocente,
  entrada: { asignaturaId: string; tituloUnidad: string; numeroClases: number }
): Promise<ResultadoClases> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  const numeroClases = Math.min(Math.max(Math.round(entrada.numeroClases), 1), 12);

  const asignatura = await prisma.asignatura.findFirst({
    where: { id: entrada.asignaturaId, ...whereAsignaturasAccesibles(user) },
    select: { nombre: true, curso: { select: { nivel: true } } },
  });
  if (!asignatura) return { ok: false, error: "No tienes acceso a esa asignatura." };

  const oas = await prisma.oa.findMany({
    where: { nivel: asignatura.curso.nivel, asignatura: asignatura.nombre },
    orderBy: { numero: "asc" },
    select: { codigo: true, eje: true, descripcion: true },
    take: 40,
  });
  const codigosValidos = new Set(oas.map((o) => o.codigo));
  const listaOa = oas.length
    ? oas.map((o) => `- ${o.codigo} (${o.eje}): ${o.descripcion}`).join("\n")
    : "(No hay OA cargados para este nivel/asignatura; deja oaCodigos vacío en cada clase.)";

  const prompt = `Planifica una secuencia de ${numeroClases} clases para la unidad "${entrada.tituloUnidad}" de ${asignatura.nombre}, nivel ${asignatura.curso.nivel} (Chile).
Cada clase debe tener un foco claro y progresivo dentro de la unidad.

Objetivos de Aprendizaje disponibles (usa SOLO estos códigos en oaCodigos):
${listaOa}

Entrega exactamente ${numeroClases} clases mediante la herramienta entregar_clases. Numéralas en el título (Clase 1, Clase 2…). En descripcion, indica el objetivo y la actividad principal en 1–2 oraciones en español de Chile. Asigna 1 o 2 OA por clase cuando corresponda.`;

  try {
    const cliente = clienteIA();
    const respuesta = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 2500,
        system: SISTEMA_BASE,
        tools: [HERRAMIENTA_CLASES],
        tool_choice: { type: "tool", name: "entregar_clases" },
        messages: [{ role: "user", content: prompt }],
      })
    );
    const bloque = respuesta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const crudo = (bloque?.input as { clases?: unknown })?.clases;
    if (!Array.isArray(crudo)) {
      return { ok: false, error: "La IA no devolvió clases. Intenta nuevamente." };
    }

    const clases: ClaseGenerada[] = crudo
      .slice(0, numeroClases)
      .map((c) => {
        const x = c as Record<string, unknown>;
        const titulo = typeof x.titulo === "string" ? x.titulo.trim().slice(0, 160) : "";
        const descripcion = typeof x.descripcion === "string" ? x.descripcion.trim().slice(0, 600) : "";
        const oaCodigos = Array.isArray(x.oaCodigos)
          ? [...new Set(x.oaCodigos.filter((o): o is string => typeof o === "string" && codigosValidos.has(o)))]
          : [];
        return { titulo, descripcion, oaCodigos };
      })
      .filter((c) => c.titulo.length > 0 && c.descripcion.length > 0);

    if (clases.length === 0) {
      return { ok: false, error: "La IA no devolvió clases válidas. Intenta nuevamente." };
    }

    await auditar(user, "planificacion", {
      asignaturaId: entrada.asignaturaId,
      nivel: asignatura.curso.nivel,
      generadas: clases.length,
      estructurado: true,
    });
    return { ok: true, clases };
  } catch (err) {
    console.error("[ia-clases]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}

// ── Informe / retroalimentación anclado en DATOS REALES del estudiante ─────────
// A diferencia del borrador de retroalimentación (que pide fortalezas/aspectos a
// mano), esto reúne los datos reales del estudiante —minimizados: promedios,
// asistencia y CONTEOS de anotaciones, jamás RUT/salud/textos— y redacta el
// informe al hogar. Reautoriza con el alcance de la interfaz.

export type ResultadoInforme = { ok: true; borrador: string } | { ok: false; error: string };

export async function generarInformeEstudiante(
  user: UsuarioDocente,
  estudianteId: string
): Promise<ResultadoInforme> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  try {
    const est = await prisma.estudiante.findFirst({
      where: { id: estudianteId, ...alcanceEstudiantes(user) },
      select: {
        nombres: true,
        matriculas: {
          where: { estado: "ACTIVA" },
          select: { curso: { select: { id: true, nivel: true, letra: true } } },
          take: 1,
        },
      },
    });
    if (!est) return { ok: false, error: "No tienes acceso a ese estudiante." };

    const nombrePila = est.nombres.split(" ")[0];
    const curso = est.matriculas[0]?.curso ?? null;

    // Promedio por asignatura (solo sumativas ponderan), del curso del estudiante.
    const asignaturas = curso
      ? await prisma.asignatura.findMany({
          where: { cursoId: curso.id, colegioId: user.colegioId },
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
          orderBy: { nombre: "asc" },
        })
      : [];

    const porAsignatura = asignaturas
      .map((a) => {
        const items: ItemPromedio[] = a.evaluaciones.map((e) => {
          const cal = e.calificaciones[0];
          return { nota: cal?.eximida ? null : cal?.nota ?? null, ponderacion: e.ponderacion, computa: !cal?.eximida };
        });
        return { nombre: a.nombre, promedio: calcularPromedio(items).promedio };
      })
      .filter((p): p is { nombre: string; promedio: number } => p.promedio !== null);
    const promGeneral = promedioGeneral(porAsignatura.map((p) => p.promedio));

    const asistencias = await prisma.asistenciaDiaria.findMany({
      where: { estudianteId, colegioId: user.colegioId },
      select: { estado: true },
    });
    const resumen = calcularResumen(asistencias.map((a) => a.estado as EstadoAsistencia));

    const [anotPos, anotNeg] = await Promise.all([
      prisma.anotacion.count({ where: { estudianteId, colegioId: user.colegioId, eliminadaEn: null, tipo: "POSITIVA" } }),
      prisma.anotacion.count({ where: { estudianteId, colegioId: user.colegioId, eliminadaEn: null, tipo: "NEGATIVA" } }),
    ]);

    const datos = [
      `Nombre de pila: ${nombrePila}`,
      `Curso: ${curso ? `${curso.nivel} ${curso.letra}` : "—"}`,
      `Promedio general: ${promGeneral !== null ? promGeneral.toFixed(1) : "sin notas registradas"}`,
      "Promedios por asignatura:",
      porAsignatura.length
        ? porAsignatura.map((p) => `- ${p.nombre}: ${p.promedio.toFixed(1)}`).join("\n")
        : "- (sin notas)",
      `Asistencia: ${resumen.porcentaje !== null ? `${resumen.porcentaje}%` : "sin registro"} sobre ${resumen.diasConRegistro} días con registro`,
      `Anotaciones: ${anotPos} positivas, ${anotNeg} negativas`,
    ].join("\n");

    const prompt = `Redacta un informe de retroalimentación (informe al hogar) para ${nombrePila}, dirigido a su familia, basándote SOLO en estos datos:
${datos}

Escribe 2 a 3 párrafos cálidos, respetuosos y no estigmatizantes:
1) Reconoce fortalezas concretas (asignaturas con mejor promedio, buena asistencia, anotaciones positivas).
2) Orienta con tacto lo que puede mejorar (asignaturas bajo 4.0, inasistencias, o anotaciones negativas si las hubiera), con sugerencias accionables para acompañar desde casa.
3) Cierra con un mensaje de aliento.
Usa la escala 1.0–7.0 (aprobación 4.0). No inventes datos que no estén arriba. No incluyas RUT ni información de salud.`;

    const borrador = await llamarIA(SISTEMA_BASE, prompt);
    await auditar(user, "retroalimentacion", { estudianteId, tipo: "informe-datos-reales" });
    return { ok: true, borrador };
  } catch (err) {
    console.error("[ia-informe]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}

// ── Análisis pedagógico de un curso en una asignatura (desde notas reales) ─────

export type ResultadoAnalisis = { ok: true; analisis: string } | { ok: false; error: string };

export async function analizarCursoAsignatura(
  user: UsuarioDocente,
  asignaturaId: string
): Promise<ResultadoAnalisis> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  try {
    const asig = await prisma.asignatura.findFirst({
      where: { id: asignaturaId, ...whereAsignaturasAccesibles(user) },
      select: {
        nombre: true,
        curso: {
          select: {
            nivel: true,
            letra: true,
            matriculas: {
              where: { estado: "ACTIVA" },
              select: { estudiante: { select: { id: true, nombres: true } } },
            },
          },
        },
        evaluaciones: {
          where: { eliminadaEn: null, tipo: "SUMATIVA" },
          select: {
            ponderacion: true,
            calificaciones: { where: { eliminadaEn: null }, select: { estudianteId: true, nota: true, eximida: true } },
          },
        },
      },
    });
    if (!asig) return { ok: false, error: "No tienes acceso a esa asignatura." };

    // Promedio de cada estudiante en la asignatura (solo nombre de pila + nota).
    const promedios = asig.curso.matriculas
      .map((m) => {
        const items: ItemPromedio[] = asig.evaluaciones.map((e) => {
          const cal = e.calificaciones.find((c) => c.estudianteId === m.estudiante.id);
          return { nota: cal?.eximida ? null : cal?.nota ?? null, ponderacion: e.ponderacion, computa: !cal?.eximida };
        });
        return { nombre: m.estudiante.nombres.split(" ")[0], promedio: calcularPromedio(items).promedio };
      })
      .filter((p): p is { nombre: string; promedio: number } => p.promedio !== null);

    if (promedios.length === 0) {
      return { ok: false, error: "Aún no hay notas suficientes para analizar." };
    }

    const total = promedios.length;
    const prom = promedioGeneral(promedios.map((p) => p.promedio));
    const reprobados = promedios.filter((p) => p.promedio < 4).length;
    const banda = (lo: number, hi: number) => promedios.filter((p) => p.promedio >= lo && p.promedio < hi).length;
    // Quienes más necesitan apoyo (los promedios más bajos), por nombre de pila.
    const apoyo = [...promedios].sort((a, b) => a.promedio - b.promedio).slice(0, 6);

    const datos = [
      `Asignatura: ${asig.nombre} · Curso ${asig.curso.nivel} ${asig.curso.letra}`,
      `Estudiantes con nota: ${total} · Promedio del curso: ${prom !== null ? prom.toFixed(1) : "—"}`,
      `Reprobando (bajo 4.0): ${reprobados}`,
      `Distribución: 1.0–3.9: ${banda(1, 4)} · 4.0–4.9: ${banda(4, 5)} · 5.0–5.9: ${banda(5, 6)} · 6.0–7.0: ${banda(6, 7.1)}`,
      `Estudiantes con menor promedio: ${apoyo.map((p) => `${p.nombre} (${p.promedio.toFixed(1)})`).join(", ")}`,
    ].join("\n");

    const prompt = `Analiza pedagógicamente el desempeño de este curso en la asignatura, para el/la docente. Basándote SOLO en estos datos:
${datos}

Entrega, en español de Chile, con subtítulos breves:
1) Lectura general del curso (nivel de logro, qué tan parejo o disperso).
2) Estudiantes a acompañar (usa solo nombres de pila entregados) y una hipótesis prudente de por qué.
3) Posibles brechas de aprendizaje a reforzar en la asignatura.
4) 3 a 4 acciones concretas de remediación/reforzamiento aplicables en clases.
Sé concreto y accionable. No inventes datos ni nombres que no estén arriba. Escala 1.0–7.0, aprobación 4.0.`;

    const analisis = await llamarIA(SISTEMA_BASE, prompt);
    await auditar(user, "resumen-consejo", { asignaturaId, tipo: "analisis-curso" });
    return { ok: true, analisis };
  } catch (err) {
    console.error("[ia-analisis]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}

export async function generarBorradorDocente(
  user: UsuarioDocente,
  entrada: EntradaBorrador
): Promise<ResultadoBorrador> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  try {
    switch (entrada.tipo) {
      case "planificacion":
        return await planificacion(user, entrada);
      case "retroalimentacion":
        return await retroalimentacion(user, entrada);
      case "resumen-consejo":
        return await resumenConsejo(user, entrada);
      case "comunicado":
        return await comunicado(user, entrada);
    }
  } catch (err) {
    console.error("[ia-docente]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}
