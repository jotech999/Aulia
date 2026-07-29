"use server";

import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  hoyEnSantiago,
  diaSemanaHoySantiago,
  fechaDesdeISO,
  formatearFechaLarga,
} from "@/lib/fecha";
import { whereAsignaturasFirma } from "@/app/(dashboard)/libro-clases/firma/consultas";

export type EstadoClase = "firmada" | "sin_firmar" | "pendiente";

export type ClaseHoy = {
  asignaturaId: string;
  hora: string;
  horaFin: string;
  asignatura: string;
  color: string | null;
  curso: string;
  estado: EstadoClase;
};

export type EventoHoy = { titulo: string; tipo: string };

/** Pulso del colegio del día (para dirección/UTP/admin). */
export type ResumenColegio = {
  clasesFirmadas: number;
  clasesProgramadas: number;
  asistenciasHoy: number;
};

export type AgendaHoy = {
  fechaLarga: string;
  esGestor: boolean;
  /** Asistencia del curso donde el usuario es profesor jefe (si aplica). */
  asistencia: { curso: string; tomada: boolean } | null;
  clases: ClaseHoy[];
  /** Pulso del colegio (solo gestores). */
  resumen: ResumenColegio | null;
  /** Eventos del calendario para hoy (reuniones, suspensiones, efemérides…). */
  eventos: EventoHoy[];
};

const GESTORES = new Set(["ADMIN", "DIRECTOR", "UTP"]);

/** Eventos del calendario de hoy; acotados a cursos si se indican (docente). */
async function eventosDeHoy(
  colegioId: string,
  fecha: Date,
  cursoIds: string[] | null
): Promise<EventoHoy[]> {
  return prisma.eventoEscolar.findMany({
    where: {
      colegioId,
      eliminadaEn: null,
      fecha,
      ...(cursoIds ? { OR: [{ cursoId: null }, { cursoId: { in: cursoIds } }] } : {}),
    },
    select: { titulo: true, tipo: true },
    orderBy: { titulo: "asc" },
    take: 5,
  });
}

/**
 * Agenda del día. Para docentes: sus clases de hoy con estado de firma y —si es
 * profesor jefe— la asistencia de su curso. Para dirección/UTP/admin: un pulso
 * del colegio (clases firmadas, asistencias). Ambos ven los eventos de hoy.
 * Todo en zona Santiago (CLAUDE.md §4) y acotado al colegio (multi-tenant). Se
 * ejecuta solo al abrir el panel, no en cada carga de página.
 */
export async function agendaHoy(): Promise<AgendaHoy> {
  const { user } = await requerirSesion();
  const hoy = hoyEnSantiago();
  const dia = diaSemanaHoySantiago();
  const fechaLarga = formatearFechaLarga(hoy);
  const fechaHoy = fechaDesdeISO(hoy);
  const esGestor = GESTORES.has(user.rol);

  // ── Dirección / UTP / admin: pulso del colegio ──────────────────────────
  if (esGestor) {
    const [clasesProgramadas, clasesFirmadas, asistenciasHoy, eventos] = await Promise.all([
      prisma.bloqueHorario.count({
        where: {
          colegioId: user.colegioId,
          eliminadaEn: null,
          dia,
          horarioVersion: { estado: "PUBLICADO", vigenteDesde: { lte: fechaHoy }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaHoy } }] },
          asignatura: { colegioId: user.colegioId },
        },
      }),
      prisma.claseRegistrada.count({
        where: { colegioId: user.colegioId, fecha: fechaHoy, eliminadaEn: null, firmadaEn: { not: null } },
      }),
      prisma.asistenciaDiaria.count({
        where: { colegioId: user.colegioId, fecha: fechaHoy },
      }),
      eventosDeHoy(user.colegioId, fechaHoy, null),
    ]);
    return {
      fechaLarga,
      esGestor: true,
      asistencia: null,
      clases: [],
      resumen: { clasesFirmadas, clasesProgramadas, asistenciasHoy },
      eventos,
    };
  }

  // ── Docente: sus clases de hoy ──────────────────────────────────────────
  const asignaturas = await prisma.asignatura.findMany({
    where: whereAsignaturasFirma(user),
    select: {
      id: true,
      nombre: true,
      color: true,
      curso: { select: { id: true, nivel: true, letra: true } },
      bloques: {
        where: {
          colegioId: user.colegioId,
          dia,
          eliminadaEn: null,
          horarioVersion: { estado: "PUBLICADO", vigenteDesde: { lte: fechaHoy }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fechaHoy } }] },
        },
        select: { id: true, horaInicio: true, horaFin: true },
      },
    },
  });

  const bloquesHoy = asignaturas
    .flatMap((a) => a.bloques.map((b) => ({ a, b })))
    .sort((x, y) => x.b.horaInicio.localeCompare(y.b.horaInicio));

  const registradas = bloquesHoy.length
    ? await prisma.claseRegistrada.findMany({
        where: {
          colegioId: user.colegioId,
          asignaturaId: { in: [...new Set(bloquesHoy.map((c) => c.a.id))] },
          fecha: fechaHoy,
          eliminadaEn: null,
        },
        select: { asignaturaId: true, bloqueHorarioId: true, firmadaEn: true },
      })
    : [];

  const estadoDe = (aId: string, bId: string): EstadoClase => {
    const r = registradas.find(
      (x) => x.asignaturaId === aId && x.bloqueHorarioId === bId
    );
    if (!r) return "pendiente";
    return r.firmadaEn ? "firmada" : "sin_firmar";
  };

  const clases: ClaseHoy[] = bloquesHoy.map(({ a, b }) => ({
    asignaturaId: a.id,
    hora: b.horaInicio,
    horaFin: b.horaFin,
    asignatura: a.nombre,
    color: a.color,
    curso: `${a.curso.nivel} ${a.curso.letra}`,
    estado: estadoDe(a.id, b.id),
  }));

  // Asistencia diaria del curso donde el usuario es profesor jefe.
  let asistencia: AgendaHoy["asistencia"] = null;
  const cursoJefe = await prisma.curso.findFirst({
    where: { colegioId: user.colegioId, profesorJefeId: user.id },
    select: { id: true, nivel: true, letra: true },
  });
  if (cursoJefe) {
    const registros = await prisma.asistenciaDiaria.count({
      where: {
        colegioId: user.colegioId,
        fecha: fechaHoy,
        estudiante: {
          matriculas: { some: { cursoId: cursoJefe.id, estado: "ACTIVA" } },
        },
      },
    });
    asistencia = { curso: `${cursoJefe.nivel} ${cursoJefe.letra}`, tomada: registros > 0 };
  }

  const cursoIds = [...new Set(asignaturas.map((a) => a.curso.id))];
  const eventos = await eventosDeHoy(user.colegioId, fechaHoy, cursoIds);

  return { fechaLarga, esGestor: false, asistencia, clases, resumen: null, eventos };
}
