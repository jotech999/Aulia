import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fechaDesdeISO, hoyEnSantiago, diaSemanaHoySantiago, formatearFechaLarga } from "@/lib/fecha";
import { NOTA_APROBACION } from "@/lib/calificaciones";
import { colorAsignatura } from "@/lib/colores-asignatura";

const DIAS: Record<number, string> = { 1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes" };

export async function PanelEstudiante({ usuarioId, colegioId, nombre }: { usuarioId: string; colegioId: string; nombre?: string | null }) {
  const acceso = await prisma.accesoEstudiante.findFirst({
    where: { colegioId, usuarioId, activo: true, revocadoEn: null },
    select: {
      estudianteId: true,
      estudiante: {
        select: {
          nombres: true,
          matriculas: { where: { colegioId, estado: "ACTIVA" }, take: 1, select: { curso: { select: { id: true, nivel: true, letra: true } } } },
        },
      },
    },
  });
  if (!acceso?.estudiante.matriculas[0]) {
    return <div className="mx-auto max-w-xl rounded-2xl border border-borde bg-superficie p-8 text-center"><h1 className="font-display text-2xl font-bold text-tinta">Tu portal está casi listo</h1><p className="mt-2 text-sm text-tinta-suave">El colegio debe vincular tu cuenta con una matrícula activa. No necesitas crear otra cuenta.</p><Link href="/privacidad" className="mt-5 inline-flex rounded-xl border border-borde px-4 py-2 text-sm font-semibold text-tinta-suave">Privacidad y mis datos</Link></div>;
  }
  const curso = acceso.estudiante.matriculas[0].curso;
  const hoyISO = hoyEnSantiago();
  const hoy = fechaDesdeISO(hoyISO);
  const dia = diaSemanaHoySantiago();
  const [asignaturas, proximas, notas, comunicados] = await Promise.all([
    prisma.asignatura.findMany({
      where: { colegioId, cursoId: curso.id },
      select: { nombre: true, color: true, bloques: { where: { colegioId, eliminadaEn: null, dia, horarioVersion: { estado: "PUBLICADO", vigenteDesde: { lte: hoy }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: hoy } }] } }, select: { id: true, horaInicio: true, horaFin: true } } },
      orderBy: { nombre: "asc" },
    }),
    prisma.evaluacion.findMany({
      where: { colegioId, eliminadaEn: null, fecha: { gte: hoy }, asignatura: { cursoId: curso.id, colegioId } },
      select: { id: true, nombre: true, fecha: true, contenidos: true, asignatura: { select: { nombre: true, color: true } } },
      orderBy: { fecha: "asc" }, take: 6,
    }),
    prisma.calificacion.findMany({
      where: { colegioId, estudianteId: acceso.estudianteId, eliminadaEn: null, OR: [{ nota: { not: null } }, { eximida: true }] },
      select: { id: true, nota: true, eximida: true, evaluacion: { select: { nombre: true, fecha: true, asignatura: { select: { nombre: true } } } } },
      orderBy: { actualizadaEn: "desc" }, take: 8,
    }),
    prisma.comunicado.findMany({
      where: { colegioId, estado: "PUBLICADO", esPlantilla: false, eliminadoEn: null, OR: [{ objetivos: { some: { colegioId, estudianteId: acceso.estudianteId } } }, { destinatarios: { some: { colegioId, estudianteId: acceso.estudianteId } } }] },
      select: { id: true, titulo: true, cuerpo: true, publicadoEn: true, creadoEn: true },
      orderBy: { creadoEn: "desc" }, take: 4,
    }),
  ]);
  const bloques = asignaturas.flatMap((a) => a.bloques.map((b) => ({ ...b, asignatura: a.nombre, color: a.color }))).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  return <div className="animar-surgir space-y-8">
    <header className="encabezado-cine malla-academica estrellas relative overflow-hidden rounded-2xl px-6 py-7 text-white shadow-elevada sm:px-8"><span className="aurora-luz aurora-luz-1" aria-hidden /><span className="aurora-luz aurora-luz-2" aria-hidden /><p className="text-xs font-semibold uppercase tracking-wider text-white/60">{formatearFechaLarga(hoyISO)}</p><h1 className="mt-1 font-display text-3xl font-bold">Hola, {(nombre ?? acceso.estudiante.nombres).split(" ")[0]}</h1><p className="mt-1 text-sm text-white/75">{curso.nivel} {curso.letra} · Tu jornada, evaluaciones y resultados en un solo lugar.</p></header>
    <section><div className="flex items-baseline justify-between"><h2 className="font-display text-lg font-semibold text-tinta">Hoy, {DIAS[dia] ?? "sin clases"}</h2><Link href="/calendario" className="text-xs font-semibold text-marca-600">Ver agenda →</Link></div>{bloques.length === 0 ? <p className="mt-3 rounded-xl border border-borde bg-superficie p-5 text-sm text-tinta-suave">No hay bloques programados para hoy.</p> : <ol className="mt-3 grid gap-2 sm:grid-cols-2">{bloques.map((b) => { const color = colorAsignatura(b.asignatura, b.color); return <li key={b.id} className="superficie flex items-center gap-3 rounded-xl p-4"><span className={`h-10 w-1 rounded-full ${color.punto}`} /><div><p className="font-semibold text-tinta">{b.asignatura}</p><p className="text-xs tabular-nums text-tinta-tenue">{b.horaInicio}–{b.horaFin}</p></div></li>; })}</ol>}</section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section><h2 className="font-display text-lg font-semibold text-tinta">Próximas evaluaciones</h2><ul className="mt-3 space-y-2">{proximas.length === 0 ? <li className="rounded-xl border border-borde bg-superficie p-5 text-sm text-tinta-suave">No hay evaluaciones próximas publicadas.</li> : proximas.map((e) => <li key={e.id} className="superficie flex items-center justify-between gap-3 rounded-xl p-4"><div className="min-w-0"><p className="font-semibold text-tinta">{e.nombre}</p><p className="text-xs text-tinta-tenue">{e.asignatura.nombre}</p>{e.contenidos ? <p className="mt-1 text-xs leading-snug text-tinta-suave"><span className="font-semibold text-tinta-tenue">Qué entra:</span> {e.contenidos}</p> : null}</div><time className="rounded-lg bg-marca-50 px-2.5 py-1.5 text-xs font-semibold text-marca-700">{new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" }).format(e.fecha)}</time></li>)}</ul></section>
      <section><h2 className="font-display text-lg font-semibold text-tinta">Resultados recientes</h2><ul className="mt-3 space-y-2">{notas.length === 0 ? <li className="rounded-xl border border-borde bg-superficie p-5 text-sm text-tinta-suave">Aún no hay resultados disponibles.</li> : notas.map((n) => <li key={n.id} className="superficie flex items-center justify-between gap-3 rounded-xl p-4"><div><p className="font-semibold text-tinta">{n.evaluacion.asignatura.nombre}</p><p className="text-xs text-tinta-tenue">{n.evaluacion.nombre}</p></div>{n.eximida ? <span className="rounded-lg bg-superficie-3 px-2 py-1 text-xs font-semibold">Eximido</span> : <span className={`rounded-lg px-2.5 py-1 text-base font-bold ${Number(n.nota) >= NOTA_APROBACION ? "bg-exito-suave text-exito" : "bg-peligro-suave text-peligro"}`}>{n.nota?.toFixed(1)}</span>}</li>)}</ul></section>
    </div>
    <section><div className="flex items-baseline justify-between"><h2 className="font-display text-lg font-semibold text-tinta">Comunicados</h2><Link href="/privacidad" className="text-xs font-semibold text-marca-600">Privacidad →</Link></div><ul className="mt-3 grid gap-3 sm:grid-cols-2">{comunicados.length === 0 ? <li className="rounded-xl border border-borde bg-superficie p-5 text-sm text-tinta-suave">No tienes comunicados nuevos.</li> : comunicados.map((c) => <li key={c.id} className="superficie rounded-xl p-4"><p className="font-semibold text-tinta">{c.titulo}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-tinta-suave">{c.cuerpo}</p></li>)}</ul></section>
  </div>;
}
