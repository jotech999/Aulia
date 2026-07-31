import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { clienteIA, IA_MODELO, iaDisponible, conReintento, mensajeErrorIA } from "./cliente";
import { calcularPromedio, promedioGeneral, type ItemPromedio } from "@/lib/calificaciones";
import { calcularResumen, type EstadoAsistencia } from "@/lib/asistencia";
import { hoyEnSantiago, fechaDesdeISO } from "@/lib/fecha";
import { nombreCurso } from "@/lib/cursos";
import type { UsuarioIA } from "./alcance";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * KIT DE REUNIÓN DE APODERADOS: la minuta completa de la próxima reunión del
 * curso, generada con los DATOS REALES agregados — asistencia, rendimiento,
 * próximas evaluaciones y acuerdos de la reunión anterior.
 *
 * Minimización (Ley 21.719): al modelo solo van AGREGADOS del curso
 * (porcentajes, promedios, conteos) y fechas públicas. JAMÁS nombres,
 * notas individuales ni casos particulares. El resultado es un borrador.
 */

export type ResultadoKit =
  | { ok: true; minuta: string }
  | { ok: false; error: string };

const SISTEMA = `Preparas la minuta de una reunión de apoderados para el profesor jefe de un colegio chileno, dentro de Aulia.

ESTRUCTURA OBLIGATORIA (markdown simple, títulos con ##):
## Bienvenida y agenda (2 líneas)
## Cómo vamos como curso — asistencia y rendimiento en positivo y con los datos entregados; si algo está bajo, plantéalo como desafío conjunto, sin dramatizar
## Fechas que vienen — lista de próximas evaluaciones y eventos
## Seguimiento de acuerdos anteriores — si se entregan; si no, omite la sección
## Espacio de la directiva y varios
## Acuerdos de hoy — deja 3 líneas con viñetas vacías "- " para completar en la reunión

REGLAS: español de Chile cercano y profesional; hablas a apoderados, no a docentes; NUNCA menciones estudiantes individuales ni inventes datos que no recibiste; usa los números tal cual. Tono: aliado de las familias.
Responde SOLO con la minuta en markdown, sin preámbulos.`;

export async function generarKitReunion(
  user: UsuarioIA,
  cursoId: string
): Promise<ResultadoKit> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }

  // El curso debe ser del colegio y (si no es gestión) de la jefatura del usuario.
  const esGestion = ["ADMIN", "DIRECTOR", "UTP"].includes(user.rol);
  const curso = await prisma.curso.findFirst({
    where: {
      id: cursoId,
      colegioId: user.colegioId,
      ...(esGestion ? {} : { profesorJefeId: user.id }),
    },
    select: { id: true, nivel: true, letra: true },
  });
  if (!curso) return { ok: false, error: "Curso no encontrado o sin jefatura tuya." };

  const hoy = fechaDesdeISO(hoyEnSantiago());
  const [matriculas, asistencias, asignaturas, proximasEval, eventos, reunionAnterior] =
    await Promise.all([
      prisma.matricula.count({ where: { colegioId: user.colegioId, cursoId, estado: "ACTIVA" } }),
      prisma.asistenciaDiaria.findMany({
        where: { colegioId: user.colegioId, estudiante: { matriculas: { some: { cursoId, estado: "ACTIVA" } } } },
        select: { estado: true },
      }),
      prisma.asignatura.findMany({
        where: { colegioId: user.colegioId, cursoId },
        select: {
          nombre: true,
          evaluaciones: {
            where: { eliminadaEn: null, tipo: "SUMATIVA" },
            select: {
              ponderacion: true,
              calificaciones: { where: { eliminadaEn: null }, select: { estudianteId: true, nota: true, eximida: true } },
            },
          },
        },
      }),
      prisma.evaluacion.findMany({
        where: { colegioId: user.colegioId, eliminadaEn: null, asignatura: { cursoId }, fecha: { gte: hoy } },
        select: { nombre: true, fecha: true, asignatura: { select: { nombre: true } } },
        orderBy: { fecha: "asc" },
        take: 8,
      }),
      prisma.eventoEscolar.findMany({
        where: { colegioId: user.colegioId, eliminadaEn: null, fecha: { gte: hoy }, OR: [{ cursoId: null }, { cursoId }] },
        select: { titulo: true, fecha: true },
        orderBy: { fecha: "asc" },
        take: 5,
      }),
      prisma.reunionApoderados.findFirst({
        where: { colegioId: user.colegioId, cursoId, eliminadaEn: null, fecha: { lt: hoy } },
        select: { fecha: true, tema: true, acuerdos: true },
        orderBy: { fecha: "desc" },
      }),
    ]);

  // Agregados (sin identidad): % asistencia y promedio del curso.
  const resumen = calcularResumen(asistencias.map((a) => a.estado as EstadoAsistencia));
  const porEstudiante = new Map<string, ItemPromedio[]>();
  for (const a of asignaturas) {
    for (const ev of a.evaluaciones) {
      for (const cal of ev.calificaciones) {
        const items = porEstudiante.get(cal.estudianteId) ?? [];
        items.push({ nota: cal.eximida ? null : cal.nota, ponderacion: ev.ponderacion, computa: !cal.eximida });
        porEstudiante.set(cal.estudianteId, items);
      }
    }
  }
  const promedios = [...porEstudiante.values()]
    .map((items) => calcularPromedio(items).promedio)
    .filter((p): p is number => p !== null);
  const promedioCurso = promedioGeneral(promedios);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long" }).format(d);

  const datos = [
    `Curso: ${nombreCurso(curso)} · ${matriculas} estudiantes matriculados`,
    `Asistencia acumulada del curso: ${resumen.porcentaje}%`,
    promedioCurso !== null ? `Promedio general del curso: ${promedioCurso.toFixed(1)} (escala 1.0-7.0)` : "Aún sin promedios registrados",
    proximasEval.length
      ? `Próximas evaluaciones: ${proximasEval.map((e) => `${e.asignatura.nombre} "${e.nombre}" el ${fmt(e.fecha)}`).join("; ")}`
      : "Sin evaluaciones agendadas",
    eventos.length ? `Próximos eventos del colegio: ${eventos.map((e) => `${e.titulo} (${fmt(e.fecha)})`).join("; ")}` : "",
    reunionAnterior?.acuerdos
      ? `Acuerdos de la reunión anterior (${fmt(reunionAnterior.fecha)}, tema "${reunionAnterior.tema}"): ${reunionAnterior.acuerdos}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const cliente = clienteIA();
    const mensaje = await conReintento(() =>
      cliente.messages.create({
        model: IA_MODELO,
        max_tokens: 1400,
        system: SISTEMA,
        messages: [{ role: "user", content: `Datos agregados del curso:\n${datos}` }],
      })
    );
    const minuta = mensaje.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!minuta) return { ok: false, error: "No se pudo generar la minuta. Intenta de nuevo." };

    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "ia:kit-reunion",
        entidadId: cursoId,
        despues: { herramienta: "kit_reunion" },
      });
    } catch {
      /* no botar la generación */
    }
    return { ok: true, minuta };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}
