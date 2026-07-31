import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import { hoyEnSantiago, fechaDesdeISO, isoDesdeFecha } from "@/lib/fecha";
import type { UsuarioIA } from "./alcance";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * AGENTE DE FISCALIZACIÓN: simula la visita de la Superintendencia ANTES de
 * que ocurra. Reúne las brechas operativas reales del libro de clases
 * (firmas pendientes, listas sin pasar, evaluaciones vencidas sin calificar)
 * y redacta un plan de cierre priorizado.
 *
 * Cumplimiento: solo AGREGADOS y metadatos del libro (cursos, asignaturas,
 * fechas, conteos). Jamás datos personales de estudiantes.
 */

export type ResultadoFiscalizacion = { ok: true; informe: string } | { ok: false; error: string };

const SISTEMA = `Eres un ex fiscalizador de la Superintendencia de Educación de Chile que hoy asesora colegios, dentro de Aulia.
Tu trabajo: leer las brechas operativas del libro de clases digital y entregar un PLAN DE CIERRE previo a una fiscalización.

REGLAS:
- Usa EXCLUSIVAMENTE los datos entregados; no inventes cifras ni normas inexistentes.
- Marco: Circular N°30 (libro de clases, firmas del leccionario, registro de asistencia) y Decreto 67 (evaluación).
- Estructura: **Semáforo general** (verde/amarillo/rojo con justificación breve) → **Brechas encontradas** (de mayor a menor riesgo, con cifra y qué exigiría un fiscalizador) → **Plan de cierre en 7 días** (acciones concretas por responsable: dirección, UTP, docentes) → **Qué mostrar el día de la visita**.
- Español de Chile, directo y sin alarmismo: el objetivo es cerrar brechas, no asustar. Máximo ~450 palabras.`;

export async function generarSimulacroFiscalizacion(
  user: UsuarioIA
): Promise<ResultadoFiscalizacion> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  try {
    const colegioId = user.colegioId;
    const hoyISO = hoyEnSantiago();
    const hoy = fechaDesdeISO(hoyISO);

    const [sinFirmar, cursos, marcasHoy, evalsVencidas] = await Promise.all([
      // Clases dictadas y no firmadas (la firma certifica la clase — Circular 30).
      prisma.claseRegistrada.findMany({
        where: { colegioId, firmadaEn: null, eliminadaEn: null },
        select: {
          fecha: true,
          asignatura: {
            select: { nombre: true, curso: { select: { nivel: true, letra: true } } },
          },
        },
        orderBy: { fecha: "asc" },
        take: 400,
      }),
      prisma.curso.findMany({
        where: { colegioId },
        select: {
          nivel: true,
          letra: true,
          matriculas: { where: { estado: "ACTIVA" }, select: { estudianteId: true } },
        },
      }),
      // Estudiantes con alguna marca HOY → detecta cursos sin lista pasada.
      prisma.asistenciaDiaria.findMany({
        where: { colegioId, fecha: hoy },
        select: { estudianteId: true },
        distinct: ["estudianteId"],
      }),
      // Evaluaciones sumativas con fecha vencida y sin ninguna nota registrada.
      prisma.evaluacion.findMany({
        where: {
          colegioId,
          tipo: "SUMATIVA",
          eliminadaEn: null,
          fecha: { lt: hoy },
          calificaciones: { none: { eliminadaEn: null } },
        },
        select: {
          nombre: true,
          fecha: true,
          asignatura: {
            select: { nombre: true, curso: { select: { nivel: true, letra: true } } },
          },
        },
        orderBy: { fecha: "asc" },
        take: 60,
      }),
    ]);

    // Agregar firmas pendientes por curso (metadatos, sin PII).
    const firmasPorCurso = new Map<string, number>();
    let firmaMasAntigua: string | null = null;
    for (const c of sinFirmar) {
      const curso = `${c.asignatura.curso.nivel} ${c.asignatura.curso.letra}`;
      firmasPorCurso.set(curso, (firmasPorCurso.get(curso) ?? 0) + 1);
      const iso = isoDesdeFecha(c.fecha);
      if (!firmaMasAntigua || iso < firmaMasAntigua) firmaMasAntigua = iso;
    }
    const topFirmas = [...firmasPorCurso.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([curso, n]) => `${curso}: ${n} clases sin firmar`);

    const conMarca = new Set(marcasHoy.map((m) => m.estudianteId));
    const cursosSinLista = cursos
      .filter((c) => c.matriculas.length > 0 && !c.matriculas.some((m) => conMarca.has(m.estudianteId)))
      .map((c) => `${c.nivel} ${c.letra}`);

    const evalsResumen = evalsVencidas
      .slice(0, 10)
      .map(
        (e) =>
          `${e.asignatura.curso.nivel} ${e.asignatura.curso.letra} · ${e.asignatura.nombre} · "${e.nombre}" (${isoDesdeFecha(e.fecha)})`
      );

    const prompt = `Datos del colegio al ${hoyISO} (agregados del libro de clases digital):

FIRMAS DEL LECCIONARIO
- Clases dictadas sin firmar: ${sinFirmar.length}${sinFirmar.length >= 400 ? " (o más)" : ""}
- Firma pendiente más antigua: ${firmaMasAntigua ?? "—"}
- Por curso (top): ${topFirmas.length ? topFirmas.join(" · ") : "sin pendientes"}

ASISTENCIA DE HOY
- Cursos totales con matrícula activa: ${cursos.filter((c) => c.matriculas.length > 0).length}
- Cursos SIN lista pasada hoy: ${cursosSinLista.length}${cursosSinLista.length ? ` (${cursosSinLista.join(", ")})` : ""}

EVALUACIONES (Decreto 67)
- Evaluaciones sumativas con fecha vencida y sin notas: ${evalsVencidas.length}
- Ejemplos: ${evalsResumen.length ? evalsResumen.join(" | ") : "ninguna"}

Redacta el simulacro de fiscalización.`;

    const cliente = clienteIA();
    const mensaje = await conReintento(() =>
      cliente.messages
        .stream({
          model: IA_MODELO,
          max_tokens: 1600,
          system: SISTEMA,
          messages: [{ role: "user", content: prompt }],
        })
        .finalMessage()
    );
    const informe = mensaje.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    try {
      await registrarAuditoria({
        colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "informe:fiscalizacion",
        entidadId: "fiscalizacion",
        despues: { sinFirmar: sinFirmar.length, cursosSinLista: cursosSinLista.length, evalsVencidas: evalsVencidas.length },
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }

    return { ok: true, informe };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}
