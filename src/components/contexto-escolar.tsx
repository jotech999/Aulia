import { prisma } from "@/lib/prisma";
import {
  hoyEnSantiago,
  horaActualSantiago,
  diaSemanaHoySantiago,
  formatearFechaLarga,
  semestreEscolar,
} from "@/lib/fecha";
import { whereAsignaturasFirma } from "@/app/(dashboard)/libro-clases/firma/consultas";
import { colorAsignatura } from "@/lib/colores-asignatura";

const ROLES_DOCENTES = new Set(["PROFESOR", "PROFESOR_JEFE"]);

/**
 * Contexto escolar del topbar: fecha chilena, semestre y —para docentes— la
 * próxima clase de hoy según su horario. Orienta de un vistazo sin ocupar un
 * clic. Todo en zona America/Santiago (CLAUDE.md §4).
 */
export async function ContextoEscolar({
  user,
}: {
  user: { id: string; rol: string; colegioId: string };
}) {
  const hoy = hoyEnSantiago();
  const semestre = semestreEscolar();

  // Clase de hoy en el topbar: la que está EN CURSO (con su hora de término) o,
  // si no hay ninguna dictándose, la próxima que viene. Antes etiquetaba
  // "Próxima" a una clase ya empezada, contradiciendo al horario.
  let claseHoy:
    | { nombre: string; hora: string; enCurso: boolean; color: string | null }
    | null = null;
  if (ROLES_DOCENTES.has(user.rol)) {
    const ahora = horaActualSantiago();
    const dia = diaSemanaHoySantiago();
    const bloque = await prisma.bloqueHorario.findFirst({
      where: {
        eliminadaEn: null,
        dia,
        horaFin: { gt: ahora }, // aún no termina
        asignatura: whereAsignaturasFirma(user),
      },
      orderBy: { horaInicio: "asc" },
      select: {
        horaInicio: true,
        horaFin: true,
        asignatura: { select: { nombre: true, color: true } },
      },
    });
    if (bloque) {
      const enCurso = bloque.horaInicio <= ahora;
      claseHoy = {
        nombre: bloque.asignatura.nombre,
        hora: enCurso ? bloque.horaFin : bloque.horaInicio,
        enCurso,
        color: bloque.asignatura.color,
      };
    }
  }

  return (
    <div className="hidden items-center gap-3 text-sm lg:flex">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-tinta-suave">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-tinta-tenue" aria-hidden>
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 2.5v4M16 2.5v4" />
        </svg>
        <span className="capitalize">{formatearFechaLarga(hoy)}</span>
      </span>

      <span className="h-4 w-px bg-borde" aria-hidden />
      <span className="whitespace-nowrap text-tinta-tenue">{semestre}º semestre</span>

      {claseHoy && (
        <span className="hidden items-center gap-1.5 whitespace-nowrap xl:flex" title={claseHoy.enCurso ? "Clase en curso" : "Tu próxima clase de hoy"}>
          <span className="h-4 w-px bg-borde" aria-hidden />
          {claseHoy.enCurso ? (
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acento opacity-70" />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${colorAsignatura(claseHoy.nombre, claseHoy.color).punto}`} />
            </span>
          ) : (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${colorAsignatura(claseHoy.nombre, claseHoy.color).punto}`}
              aria-hidden
            />
          )}
          <span className="text-tinta-tenue">{claseHoy.enCurso ? "Ahora:" : "Próxima:"}</span>
          <span className="max-w-40 truncate font-medium text-tinta-suave">{claseHoy.nombre}</span>
          <span className="tabular-nums text-tinta-tenue">
            {claseHoy.enCurso ? `hasta ${claseHoy.hora}` : claseHoy.hora}
          </span>
        </span>
      )}
    </div>
  );
}
