import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import { isoDesdeFecha, hoyEnSantiago } from "@/lib/fecha";
import type { UsuarioDocente } from "./docente";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * RESUMEN EJECUTIVO del colegio para dirección, generado con IA.
 *
 * Mismo diseño de cumplimiento que el resto de `lib/ia`:
 *  - Solo consume AGREGADOS del colegio (conteos, promedios, porcentajes).
 *    Jamás nombres, RUT ni datos individuales de estudiantes.
 *  - Es un BORRADOR de informe que dirección revisa y edita.
 *  - Reautoriza pertenencia (multi-tenant) y audita el uso sin PII.
 */

export type ResultadoEjecutivo = { ok: true; informe: string } | { ok: false; error: string };

const SISTEMA_EJECUTIVO = `Eres un analista educacional que redacta informes ejecutivos para la DIRECCIÓN de un colegio chileno, dentro de Aulia.
Redactas en español de Chile, tono profesional y directo, orientado a decisiones.

REGLAS:
- Usa EXCLUSIVAMENTE los datos agregados entregados. No inventes cifras ni menciones estudiantes individuales.
- Escala de notas chilena 1.0–7.0 (aprobación 4.0). Umbral de asistencia regular: 85%.
- El resultado es un BORRADOR editable: no afirmes que fue distribuido ni oficializado.
- Estructura con subtítulos breves y frases concisas. Máximo ~400 palabras.
- Cierra siempre con recomendaciones accionables y priorizadas.`;

async function llamarIA(prompt: string): Promise<string> {
  const cliente = clienteIA();
  const mensaje = await conReintento(() =>
    cliente.messages
      .stream({
        model: IA_MODELO,
        max_tokens: 1500,
        system: SISTEMA_EJECUTIVO,
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

export async function generarResumenEjecutivo(user: UsuarioDocente): Promise<ResultadoEjecutivo> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  try {
    const colegioId = user.colegioId;
    const hoy = hoyEnSantiago();
    const mesActual = hoy.slice(0, 7);
    const hace30 = new Date(Date.now() - 30 * 86_400_000);

    const [
      colegio,
      estudiantes,
      matriculasActivas,
      asisPorEstado,
      notasAgg,
      notasBajo4,
      anotPos30,
      anotNeg30,
      casosAbiertos,
      intervencionesAbiertas,
      entrevistas30,
    ] = await Promise.all([
      prisma.colegio.findUnique({ where: { id: colegioId }, select: { nombre: true } }),
      prisma.estudiante.count({ where: { colegioId } }),
      prisma.matricula.count({ where: { colegioId, estado: "ACTIVA" } }),
      // Asistencia del año agrupada por estado y por día (agregado puro).
      prisma.asistenciaDiaria.groupBy({
        by: ["fecha", "estado"],
        where: { colegioId },
        _count: { _all: true },
      }),
      prisma.calificacion.aggregate({
        where: { colegioId, eliminadaEn: null, eximida: false, nota: { not: null } },
        _avg: { nota: true },
        _count: { _all: true },
      }),
      prisma.calificacion.count({
        where: { colegioId, eliminadaEn: null, eximida: false, nota: { lt: 4 } },
      }),
      prisma.anotacion.count({
        where: { colegioId, eliminadaEn: null, tipo: "POSITIVA", creadaEn: { gte: hace30 } },
      }),
      prisma.anotacion.count({
        where: { colegioId, eliminadaEn: null, tipo: "NEGATIVA", creadaEn: { gte: hace30 } },
      }),
      prisma.casoConvivencia.count({
        where: { colegioId, eliminadoEn: null, estado: { not: "CERRADO" } },
      }),
      prisma.intervencion.count({
        where: { colegioId, eliminadaEn: null, estado: "ABIERTA" },
      }),
      prisma.entrevista.count({
        where: { colegioId, eliminadaEn: null, creadaEn: { gte: hace30 } },
      }),
    ]);

    // Asistencia: % del mes actual y del mes anterior (presente = ≠ AUSENTE).
    const porMes = new Map<string, { total: number; presentes: number }>();
    for (const r of asisPorEstado) {
      const ym = isoDesdeFecha(r.fecha).slice(0, 7);
      const c = porMes.get(ym) ?? { total: 0, presentes: 0 };
      c.total += r._count._all;
      if (r.estado !== "AUSENTE") c.presentes += r._count._all;
      porMes.set(ym, c);
    }
    const pctMes = (ym: string) => {
      const c = porMes.get(ym);
      return c && c.total ? Math.round((c.presentes / c.total) * 1000) / 10 : null;
    };
    const [ay, am] = mesActual.split("-").map(Number);
    const mesAnterior = `${am === 1 ? ay - 1 : ay}-${String(am === 1 ? 12 : am - 1).padStart(2, "0")}`;

    const asisActual = pctMes(mesActual);
    const asisPrevia = pctMes(mesAnterior);
    const promedio = notasAgg._avg.nota;
    const pctReprob =
      notasAgg._count._all > 0 ? Math.round((notasBajo4 / notasAgg._count._all) * 1000) / 10 : null;

    const datos = [
      `Colegio: ${colegio?.nombre ?? "—"}`,
      `Fecha del informe: ${hoy}`,
      `Estudiantes registrados: ${estudiantes} (matrícula activa: ${matriculasActivas})`,
      `Asistencia mes en curso: ${asisActual !== null ? asisActual + "%" : "sin registros"}`,
      `Asistencia mes anterior: ${asisPrevia !== null ? asisPrevia + "%" : "sin registros"}`,
      `Promedio general de calificaciones: ${promedio !== null && promedio !== undefined ? promedio.toFixed(1) : "sin notas"} (${notasAgg._count._all} notas registradas)`,
      `Porcentaje de notas insuficientes (bajo 4.0): ${pctReprob !== null ? pctReprob + "%" : "—"}`,
      `Anotaciones últimos 30 días: ${anotPos30} positivas · ${anotNeg30} negativas`,
      `Casos de convivencia abiertos: ${casosAbiertos}`,
      `Intervenciones de apoyo abiertas: ${intervencionesAbiertas}`,
      `Entrevistas realizadas últimos 30 días: ${entrevistas30}`,
    ].join("\n");

    const prompt = `Redacta el borrador de un INFORME EJECUTIVO del colegio para el equipo directivo, basándote SOLO en estos datos agregados:

${datos}

Estructura:
1) Panorama general (2–3 frases con lo esencial).
2) Asistencia (nivel, tendencia vs. mes anterior, y si está bajo el umbral de 85%).
3) Rendimiento académico (promedio, % insuficiencia, lectura prudente).
4) Convivencia y apoyo (anotaciones, casos abiertos, intervenciones y entrevistas).
5) Recomendaciones priorizadas (3 a 5 acciones concretas para las próximas 2 semanas).`;

    const informe = await llamarIA(prompt);

    try {
      await registrarAuditoria({
        colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "informe:ejecutivo",
        entidadId: "ejecutivo",
        despues: { mes: mesActual }, // metadatos, sin PII
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return { ok: true, informe };
  } catch (err) {
    console.error("[ia-ejecutivo]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}
