import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import { calcularPromedio, aproximarDecima, type ItemPromedio } from "@/lib/calificaciones";
import { calcularResumen, type EstadoAsistencia } from "@/lib/asistencia";
import { evaluarPromocion } from "@/lib/promocion";

/**
 * INFORME FUNDADO DEL ART. 11 (Decreto 67) con IA.
 *
 * Cuando un estudiante no cumple los requisitos del art. 10, el colegio debe
 * analizar el caso y dejar una resolución FUNDADA. Esta función reúne los datos
 * objetivos (promedios por asignatura, asistencia, anotaciones en recuento) y
 * redacta el BORRADOR del informe, que dirección revisa, edita y firma.
 *
 * Minimización (Ley 21.719): al modelo van nombre de pila, promedios y
 * porcentajes — nunca RUT, salud, dirección ni el texto de las anotaciones.
 */

export type UsuarioPromocionIA = { id: string; rol: string; colegioId: string };

export type ResultadoFundamento =
  | { ok: true; borrador: string }
  | { ok: false; error: string };

const SISTEMA = `Eres asesor pedagógico de un colegio chileno, dentro de Aulia, experto en el Decreto 67/2018 de evaluación, calificación y promoción.
Redactas BORRADORES de informes fundados del artículo 11 (análisis caso a caso de estudiantes que no cumplen los requisitos de promoción del artículo 10).

REGLAS:
- Español de Chile, tono profesional, respetuoso y NO estigmatizante: el informe habla del proceso de aprendizaje, nunca de la persona como problema.
- Es un BORRADOR: no afirmes que la decisión ya está tomada ni que fue notificada. La resolución la firma la dirección.
- Usa SOLO los datos entregados. Si falta información relevante (informe del profesor jefe, antecedentes socioemocionales, medidas de apoyo aplicadas), déjala como marcador [entre corchetes] para que el equipo la complete.
- El Decreto 67 exige considerar: (1) el progreso del aprendizaje del estudiante, (2) la magnitud de la brecha con sus compañeros y las consecuencias de la repitencia, y (3) formas de acompañamiento. Estructura el informe con esos tres criterios.
- No incluyas RUT, datos de salud, direcciones ni contactos.
- Entrega solo el texto del informe, sin preámbulos.`;

export async function generarFundamentoPromocion(
  user: UsuarioPromocionIA,
  entrada: { estudianteId: string; anioEscolarId: string }
): Promise<ResultadoFundamento> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  try {
    // Multi-tenant + datos mínimos del estudiante y su curso.
    const est = await prisma.estudiante.findFirst({
      where: { id: entrada.estudianteId, colegioId: user.colegioId },
      select: {
        nombres: true,
        matriculas: {
          where: { estado: "ACTIVA" },
          select: { curso: { select: { id: true, nivel: true, letra: true, anioEscolarId: true } } },
          take: 1,
        },
      },
    });
    if (!est) return { ok: false, error: "No se encontró al estudiante en este colegio." };
    const curso = est.matriculas[0]?.curso;
    if (!curso || curso.anioEscolarId !== entrada.anioEscolarId) {
      return { ok: false, error: "El estudiante no tiene matrícula activa en ese año escolar." };
    }
    const nombrePila = est.nombres.split(" ")[0];

    const asignaturas = await prisma.asignatura.findMany({
      where: { cursoId: curso.id, colegioId: user.colegioId },
      select: {
        nombre: true,
        evaluaciones: {
          where: { eliminadaEn: null, tipo: "SUMATIVA" },
          select: {
            ponderacion: true,
            calificaciones: {
              where: { estudianteId: entrada.estudianteId, eliminadaEn: null },
              select: { nota: true, eximida: true },
            },
          },
        },
      },
      orderBy: { nombre: "asc" },
    });

    const promedios = asignaturas.map((a) => {
      const items: ItemPromedio[] = a.evaluaciones.map((e) => {
        const cal = e.calificaciones[0];
        return {
          nota: cal?.eximida ? null : cal?.nota ?? null,
          ponderacion: e.ponderacion,
          computa: !cal?.eximida,
        };
      });
      const p = calcularPromedio(items).promedio;
      return { nombre: a.nombre, promedio: p === null ? null : aproximarDecima(p) };
    });

    const [asistencias, anotPos, anotNeg, intervenciones] = await Promise.all([
      prisma.asistenciaDiaria.findMany({
        where: { estudianteId: entrada.estudianteId, colegioId: user.colegioId },
        select: { estado: true },
      }),
      prisma.anotacion.count({
        where: {
          estudianteId: entrada.estudianteId,
          colegioId: user.colegioId,
          eliminadaEn: null,
          tipo: "POSITIVA",
        },
      }),
      prisma.anotacion.count({
        where: {
          estudianteId: entrada.estudianteId,
          colegioId: user.colegioId,
          eliminadaEn: null,
          tipo: "NEGATIVA",
        },
      }),
      prisma.intervencion.count({
        where: {
          estudianteId: entrada.estudianteId,
          colegioId: user.colegioId,
          eliminadaEn: null,
        },
      }),
    ]);
    const resumen = calcularResumen(asistencias.map((a) => a.estado as EstadoAsistencia));
    const propuesta = evaluarPromocion({ asignaturas: promedios, asistencia: resumen.porcentaje });

    // Referencia del curso: promedio general del grupo, para dimensionar la brecha
    // (dato agregado, sin nombres).
    const promedioCurso = await prisma.calificacion.aggregate({
      where: {
        colegioId: user.colegioId,
        eliminadaEn: null,
        eximida: false,
        nota: { not: null },
        evaluacion: { asignatura: { cursoId: curso.id }, tipo: "SUMATIVA", eliminadaEn: null },
      },
      _avg: { nota: true },
    });

    const datos = [
      `Nombre de pila: ${nombrePila}`,
      `Curso: ${curso.nivel} ${curso.letra}`,
      "Promedios finales por asignatura:",
      promedios.length
        ? promedios
            .map(
              (p) =>
                `- ${p.nombre}: ${p.promedio === null ? "sin calificaciones" : p.promedio.toFixed(1)}`
            )
            .join("\n")
        : "- (sin asignaturas registradas)",
      `Promedio general: ${propuesta.promedioGeneral !== null ? propuesta.promedioGeneral.toFixed(1) : "sin promedio"}`,
      `Promedio general del curso (referencia): ${promedioCurso._avg.nota !== null ? promedioCurso._avg.nota.toFixed(1) : "sin datos"}`,
      `Asignaturas reprobadas: ${propuesta.asignaturasReprobadas.length ? propuesta.asignaturasReprobadas.join(", ") : "ninguna"}`,
      `Asistencia anual: ${resumen.porcentaje !== null ? `${resumen.porcentaje}%` : "sin registro"} sobre ${resumen.diasConRegistro} días con registro (mínimo exigido 85%)`,
      `Anotaciones registradas: ${anotPos} positivas, ${anotNeg} negativas`,
      `Intervenciones de apoyo registradas: ${intervenciones}`,
      `Situación según Art. 10: ${propuesta.cumpleLogro ? "cumple" : "NO cumple"} el requisito de logro; ${propuesta.cumpleAsistencia ? "cumple" : "NO cumple"} el requisito de asistencia.`,
    ].join("\n");

    const prompt = `Redacta el borrador del INFORME FUNDADO del artículo 11 del Decreto 67 para ${nombrePila}, con estos datos:
${datos}

Estructura el informe con estos apartados breves:
1) Antecedentes académicos y de asistencia (resume los datos anteriores, sin repetirlos como lista).
2) Progreso del aprendizaje durante el año — usa [completar con el informe del profesor jefe] donde falte evidencia cualitativa.
3) Magnitud de la brecha con el nivel del curso y consecuencias previsibles de la repitencia para este estudiante.
4) Medidas de acompañamiento propuestas para el año siguiente (concretas y realizables por el colegio).
5) Propuesta de resolución, señalando expresamente que corresponde a la dirección resolver de forma fundada.

Máximo 500 palabras.`;

    const cliente = clienteIA();
    const mensaje = await conReintento(() =>
      cliente.messages
        .stream({
          model: IA_MODELO,
          max_tokens: 1800,
          system: SISTEMA,
          messages: [{ role: "user", content: prompt }],
        })
        .finalMessage()
    );
    const borrador = mensaje.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!borrador) return { ok: false, error: "La IA no devolvió texto. Intenta nuevamente." };

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "borrador:promocion-art11",
        entidadId: entrada.estudianteId,
        despues: { estadoPropuesto: propuesta.estado }, // sin PII
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }
    return { ok: true, borrador };
  } catch (err) {
    console.error("[ia-promocion]", err instanceof Error ? err.message : "error");
    return { ok: false, error: mensajeErrorIA(err).mensaje };
  }
}
