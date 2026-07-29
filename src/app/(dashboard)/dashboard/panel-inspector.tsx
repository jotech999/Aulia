import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fechaDesdeISO, formatearFechaLarga, hoyEnSantiago } from "@/lib/fecha";
import { Iconos } from "@/components/ui/iconos";
import { AccesosRapidos } from "@/components/ui/accesos-rapidos";

export async function PanelInspector({ colegioId, nombre, colegioNombre }: { colegioId: string; nombre?: string | null; colegioNombre: string }) {
  const hoyISO = hoyEnSantiago();
  const fecha = fechaDesdeISO(hoyISO);
  const [pendientes, ausentes, atrasados, retirados, casos, cursos, cursosConRegistro] = await Promise.all([
    prisma.justificacionInasistencia.count({ where: { colegioId, estado: "PENDIENTE" } }),
    prisma.asistenciaDiaria.count({ where: { colegioId, fecha, estado: "AUSENTE" } }),
    prisma.asistenciaDiaria.count({ where: { colegioId, fecha, estado: "ATRASADO" } }),
    prisma.asistenciaDiaria.count({ where: { colegioId, fecha, estado: "RETIRADO" } }),
    prisma.casoConvivencia.count({ where: { colegioId, estado: { in: ["ABIERTO", "EN_SEGUIMIENTO"] }, eliminadoEn: null } }),
    prisma.curso.count({ where: { colegioId } }),
    prisma.matricula.findMany({ where: { colegioId, estado: "ACTIVA", estudiante: { asistencias: { some: { colegioId, fecha } } } }, distinct: ["cursoId"], select: { cursoId: true } }),
  ]);
  const cursosConLista = cursosConRegistro.length;
  const pendientesCurso = Math.max(0, cursos - cursosConLista);
  // Cobertura del dato: los contadores de ausentes/atrasados/retirados salen de
  // AsistenciaDiaria, así que valen 0 tanto si no falta nadie como si NADIE pasó
  // lista todavía. Para el inspector —cuyo trabajo es justamente pesquisar
  // inasistencias— un "0" grande y rojo que en realidad significa "no sabemos"
  // es peor que no mostrar nada. Se declara la cobertura junto al número.
  const sinNingunRegistro = cursosConLista === 0;
  const coberturaParcial = !sinNingunRegistro && pendientesCurso > 0;
  const acciones = [
    { href: "/inspector/justificaciones", titulo: "Revisar justificaciones", detalle: pendientes ? `${pendientes} pendientes` : "Bandeja al día", icono: Iconos.asistencia, tono: pendientes ? "bg-alerta-suave text-alerta" : "bg-exito-suave text-exito" },
    { href: "/admin/asistencia-hoy", titulo: "Seguimiento de jornada", detalle: pendientesCurso ? `${pendientesCurso} cursos sin registro` : "Todos los cursos revisados", icono: Iconos.panel, tono: pendientesCurso ? "bg-peligro-suave text-peligro" : "bg-exito-suave text-exito" },
    { href: "/convivencia", titulo: "Casos de convivencia", detalle: `${casos} abiertos o en seguimiento`, icono: Iconos.convivencia, tono: "bg-marca-50 text-marca-700" },
    { href: "/admin/estudiantes", titulo: "Buscar estudiante", detalle: "Ficha y antecedentes operativos", icono: Iconos.estudiantes, tono: "bg-superficie-3 text-tinta-suave" },
  ];
  return <div className="animar-surgir space-y-7">
    <header className="encabezado-cine malla-academica rounded-2xl px-6 py-7 text-white shadow-elevada sm:px-8"><p className="text-xs font-semibold uppercase tracking-wider text-white/60">{formatearFechaLarga(hoyISO)} · {colegioNombre}</p><h1 className="mt-1.5 font-display text-3xl font-bold">Jornada de hoy{nombre ? `, ${nombre.split(" ")[0]}` : ""}</h1><p className="mt-1 text-sm text-white/75">Pendientes operativos, asistencia y convivencia sin ruido administrativo.</p></header>
    <AccesosRapidos rol="INSPECTOR" />
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
      ["Ausentes", ausentes, "text-peligro", true],
      ["Atrasados", atrasados, "text-alerta", true],
      ["Retirados", retirados, "text-tinta-suave", true],
      ["Justificaciones", pendientes, "text-marca-700", false],
    ].map(([label, value, tono, dependeDeLista]) => (
      <div key={String(label)} className="superficie rounded-xl p-4">
        <p className="text-xs font-medium text-tinta-tenue">{label}</p>
        <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${dependeDeLista && sinNingunRegistro ? "text-tinta-tenue" : tono}`}>
          {dependeDeLista && sinNingunRegistro ? "—" : value}
        </p>
        {dependeDeLista && sinNingunRegistro && (
          <p className="mt-1 text-[11px] leading-tight text-tinta-tenue">Aún nadie pasa lista hoy</p>
        )}
        {dependeDeLista && coberturaParcial && (
          <p className="mt-1 text-[11px] leading-tight text-alerta">
            {cursosConLista} de {cursos} cursos con lista
          </p>
        )}
      </div>
    ))}</section>
    <section><h2 className="font-display text-lg font-semibold text-tinta">Acciones de la jornada</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{acciones.map((a) => { const Icono = a.icono; return <Link key={a.href} href={a.href} className="superficie tarjeta-int flex min-h-24 items-center gap-4 rounded-xl p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${a.tono}`}><Icono className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-tinta">{a.titulo}</span><span className="block text-sm text-tinta-tenue">{a.detalle}</span></span><span aria-hidden className="text-tinta-tenue">→</span></Link>; })}</div></section>
  </div>;
}
