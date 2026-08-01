import { prisma } from "@/lib/prisma";
import { iaDisponible } from "@/lib/ia/cliente";
import { alcanceEstudiantes, type UsuarioIA } from "@/lib/ia/alcance";
import { BotonPreguntarAuli } from "@/components/asistente/boton-preguntar-auli";
import Link from "next/link";

/**
 * RADAR AULIA: tarjetas de insight automáticas en el panel, calculadas con
 * reglas sobre datos reales (rápidas y deterministas, sin llamada al modelo
 * en cada carga). Cada tarjeta enlaza al módulo y ofrece profundizar con
 * Auli, que sí usa IA con las herramientas de solo lectura.
 */

type Insight = {
  id: string;
  icono: string;
  valor: string;
  etiqueta: string;
  detalle: string;
  href: string;
  tono: "alerta" | "peligro" | "info";
  pregunta: string; // lo que Auli responde al profundizar
};

const TONO: Record<Insight["tono"], string> = {
  alerta: "border-alerta/25 bg-alerta-suave/60",
  peligro: "border-peligro/25 bg-peligro-suave/60",
  info: "border-marca-200 bg-marca-50/60",
};

async function insightsDocente(user: UsuarioIA): Promise<Insight[]> {
  const hace7 = new Date(Date.now() - 7 * 86400000);
  const en7 = new Date(Date.now() + 7 * 86400000);
  const [sinFirmar, mensajes, evalsVencidas, evalsProximas] = await Promise.all([
    prisma.claseRegistrada.count({
      where: {
        colegioId: user.colegioId,
        firmadaEn: null,
        eliminadaEn: null,
        asignatura: { docenteId: user.id },
      },
    }),
    prisma.mensajeDirecto.count({
      where: {
        colegioId: user.colegioId,
        deApoderado: true,
        leidoEn: null,
        estudiante: alcanceEstudiantes(user),
      },
    }),
    prisma.evaluacion.count({
      where: {
        colegioId: user.colegioId,
        tipo: "SUMATIVA",
        eliminadaEn: null,
        fecha: { lt: new Date(), gte: hace7 },
        calificaciones: { none: { eliminadaEn: null } },
        asignatura: { docenteId: user.id },
      },
    }),
    prisma.evaluacion.count({
      where: {
        colegioId: user.colegioId,
        eliminadaEn: null,
        fecha: { gte: new Date(), lte: en7 },
        asignatura: { docenteId: user.id },
      },
    }),
  ]);

  const lista: Insight[] = [];
  if (sinFirmar > 0) {
    lista.push({
      id: "firmas",
      icono: "✍️",
      valor: String(sinFirmar),
      etiqueta: sinFirmar === 1 ? "clase sin firmar" : "clases sin firmar",
      detalle: "El leccionario firmado es la evidencia legal de la clase.",
      href: "/libro-clases/firma",
      tono: "alerta",
      pregunta: "¿Qué clases tengo pendientes de firmar y qué más tengo pendiente?",
    });
  }
  if (mensajes > 0) {
    lista.push({
      id: "mensajes",
      icono: "💬",
      valor: String(mensajes),
      etiqueta: mensajes === 1 ? "mensaje de apoderado sin leer" : "mensajes de apoderados sin leer",
      detalle: "Responder a tiempo evita que un tema chico se agrande.",
      href: "/mensajes",
      tono: "info",
      pregunta: "¿Qué mensajes tengo sin leer?",
    });
  }
  if (evalsVencidas > 0) {
    lista.push({
      id: "notas",
      icono: "🧮",
      valor: String(evalsVencidas),
      etiqueta:
        evalsVencidas === 1
          ? "evaluación rendida sin notas"
          : "evaluaciones rendidas sin notas",
      detalle: "Ya pasó la fecha: los apoderados esperan las notas.",
      href: "/libro-clases/calificaciones",
      tono: "peligro",
      pregunta: "¿Qué evaluaciones vencidas tengo sin notas registradas?",
    });
  }
  if (evalsProximas > 0) {
    lista.push({
      id: "proximas",
      icono: "🗓️",
      valor: String(evalsProximas),
      etiqueta:
        evalsProximas === 1
          ? "evaluación en los próximos 7 días"
          : "evaluaciones en los próximos 7 días",
      detalle: "Revisa que el contenido esté avisado a las familias.",
      href: "/calendario",
      tono: "info",
      pregunta: "¿Qué evaluaciones vienen en los próximos días?",
    });
  }
  return lista;
}

async function insightsGestion(user: UsuarioIA): Promise<Insight[]> {
  const hace7 = new Date(Date.now() - 7 * 86400000);
  const hace14 = new Date(Date.now() - 14 * 86400000);

  // Nota: la asistencia de hoy y los cursos sin lista ya viven como KPI del
  // panel de dirección; el radar aporta lo que ese panel NO muestra.
  const [sinFirmar, evalsVencidas, anotNeg, intervenciones] = await Promise.all([
    prisma.claseRegistrada.count({
      where: { colegioId: user.colegioId, firmadaEn: null, eliminadaEn: null },
    }),
    prisma.evaluacion.count({
      where: {
        colegioId: user.colegioId,
        tipo: "SUMATIVA",
        eliminadaEn: null,
        fecha: { lt: new Date(), gte: hace14 },
        calificaciones: { none: { eliminadaEn: null } },
      },
    }),
    prisma.anotacion.count({
      where: { colegioId: user.colegioId, tipo: "NEGATIVA", eliminadaEn: null, creadaEn: { gte: hace7 } },
    }),
    prisma.intervencion.count({
      where: { colegioId: user.colegioId, estado: "ABIERTA", eliminadaEn: null },
    }),
  ]);

  const lista: Insight[] = [];
  if (sinFirmar > 0) {
    lista.push({
      id: "firmas",
      icono: "✍️",
      valor: String(sinFirmar),
      etiqueta: sinFirmar === 1 ? "clase sin firmar en el colegio" : "clases sin firmar en el colegio",
      detalle: "El leccionario firmado es la evidencia legal ante fiscalización.",
      href: "/admin/cumplimiento",
      tono: "alerta",
      pregunta: "¿Qué pendientes operativos hay en el colegio? ¿Quién concentra las firmas pendientes?",
    });
  }
  if (evalsVencidas > 0) {
    lista.push({
      id: "notas",
      icono: "🧮",
      valor: String(evalsVencidas),
      etiqueta:
        evalsVencidas === 1
          ? "evaluación rendida sin notas (14 días)"
          : "evaluaciones rendidas sin notas (14 días)",
      detalle: "Ya pasó la fecha y las familias esperan las notas.",
      href: "/libro-clases/calificaciones",
      tono: "peligro",
      pregunta: "¿Qué evaluaciones vencidas siguen sin notas registradas?",
    });
  }
  if (anotNeg > 0) {
    lista.push({
      id: "convivencia",
      icono: "⚖️",
      valor: String(anotNeg),
      etiqueta:
        anotNeg === 1
          ? "anotación negativa esta semana"
          : "anotaciones negativas esta semana",
      detalle: "Si se concentran en un curso, es señal para convivencia.",
      href: "/convivencia",
      tono: "info",
      pregunta: "¿En qué cursos se concentran las anotaciones negativas recientes?",
    });
  }
  if (intervenciones > 0) {
    lista.push({
      id: "apoyo",
      icono: "🤝",
      valor: String(intervenciones),
      etiqueta:
        intervenciones === 1 ? "intervención de apoyo abierta" : "intervenciones de apoyo abiertas",
      detalle: "Estudiantes con plan de acompañamiento en curso.",
      href: "/alertas",
      tono: "info",
      pregunta: "¿Qué estudiantes están en riesgo y qué alertas hay activas?",
    });
  }
  return lista;
}

export async function InsightsAulia({
  usuarioId,
  rol,
  colegioId,
}: {
  usuarioId: string;
  rol: string;
  colegioId: string;
}) {
  const user: UsuarioIA = { id: usuarioId, rol, colegioId };
  const esGestion = ["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"].includes(rol);
  let insights: Insight[] = [];
  try {
    insights = esGestion ? await insightsGestion(user) : await insightsDocente(user);
  } catch {
    return null; // el radar nunca debe botar el panel
  }
  if (insights.length === 0) return null;
  const conAuli = iaDisponible();

  return (
    <section aria-labelledby="radar-aulia" className="surgir-secuencia mt-5">
      <div className="flex items-center gap-2">
        <h2 id="radar-aulia" className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
          Radar Aulia · lo que merece tu atención hoy
        </h2>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {insights.slice(0, 4).map((i) => (
          <article
            key={i.id}
            className={`tarjeta-int flex flex-col rounded-xl border p-3.5 shadow-suave ${TONO[i.tono]}`}
          >
            <div className="flex items-baseline gap-2">
              <span aria-hidden className="text-base">{i.icono}</span>
              <span className="font-display text-2xl font-bold tabular-nums text-tinta">{i.valor}</span>
              <span className="text-sm font-medium leading-tight text-tinta">{i.etiqueta}</span>
            </div>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-tinta-suave">{i.detalle}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Link href={i.href} className="text-xs font-semibold text-marca-700 hover:underline">
                Ir al módulo →
              </Link>
              {conAuli && <BotonPreguntarAuli pregunta={i.pregunta} />}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
