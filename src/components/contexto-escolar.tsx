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

  // Próxima clase de hoy: solo para quien dicta clases, con horario cargado.
  let proxima: { nombre: string; horaInicio: string; color: string | null } | null = null;
  if (ROLES_DOCENTES.has(user.rol)) {
    const ahora = horaActualSantiago();
    const dia = diaSemanaHoySantiago();
    const bloque = await prisma.bloqueHorario.findFirst({
      where: {
        eliminadaEn: null,
        dia,
        horaFin: { gte: ahora }, // aún no termina
        asignatura: whereAsignaturasFirma(user),
      },
      orderBy: { horaInicio: "asc" },
      select: {
        horaInicio: true,
        asignatura: { select: { nombre: true, color: true } },
      },
    });
    if (bloque) {
      proxima = {
        nombre: bloque.asignatura.nombre,
        horaInicio: bloque.horaInicio,
        color: bloque.asignatura.color,
      };
    }
  }

  return (
    <div className="hidden items-center gap-3 text-sm lg:flex">
      <span className="flex items-center gap-1.5 text-tinta-suave">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-tinta-tenue" aria-hidden>
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 2.5v4M16 2.5v4" />
        </svg>
        <span className="capitalize">{formatearFechaLarga(hoy)}</span>
      </span>

      <span className="h-4 w-px bg-borde" aria-hidden />
      <span className="text-tinta-tenue">{semestre}º semestre</span>

      {proxima && (
        <>
          <span className="h-4 w-px bg-borde" aria-hidden />
          <span className="flex items-center gap-1.5" title="Tu próxima clase de hoy">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${colorAsignatura(proxima.nombre, proxima.color).punto}`}
              aria-hidden
            />
            <span className="text-tinta-tenue">Próxima:</span>
            <span className="font-medium text-tinta-suave">{proxima.nombre}</span>
            <span className="tabular-nums text-tinta-tenue">{proxima.horaInicio}</span>
          </span>
        </>
      )}
    </div>
  );
}
