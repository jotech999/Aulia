import { requerirRol } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { iaDisponible } from "@/lib/ia/cliente";
import { whereAsignaturasAccesibles } from "@/app/(dashboard)/planificacion/consultas";
import { alcanceCursos } from "@/lib/ia/alcance";
import { AsistenteDocente } from "./asistente-docente-cliente";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";

export const metadata = { title: "Asistente IA para docentes" };

export default async function Page() {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR");
  const disponible = iaDisponible();

  // Datos de contexto (dentro del alcance del usuario) para los selectores.
  const [asignaturas, cursos, banco] = await Promise.all([
    prisma.asignatura.findMany({
      where: whereAsignaturasAccesibles(user),
      select: { id: true, nombre: true, curso: { select: { nivel: true, letra: true } } },
      orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
      take: 200,
    }),
    prisma.curso.findMany({
      where: alcanceCursos({ id: user.id, rol: user.rol, colegioId: user.colegioId }),
      select: { id: true, nivel: true, letra: true },
      orderBy: [{ nivel: "asc" }, { letra: "asc" }],
      take: 200,
    }),
    // Banco de material compartido del colegio (lo más reciente primero).
    prisma.materialDocente.findMany({
      where: { colegioId: user.colegioId, eliminadoEn: null },
      select: {
        id: true,
        titulo: true,
        asignatura: true,
        nivel: true,
        tipoMaterial: true,
        creadoEn: true,
        contenido: true,
      },
      orderBy: { creadoEn: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-marca-600">Asistente IA</p>
        <h1 className="font-display text-2xl font-bold text-tinta">Asistente IA para docentes</h1>
        <p className="mt-1 max-w-2xl text-sm text-tinta-suave">
          Genera guías y evaluaciones imprimibles en PDF, borradores de planificación, retroalimentación,
          resúmenes para el consejo y comunicados. Tú revisas y editas antes de usarlos: la IA nunca envía
          ni guarda nada por ti.
        </p>
      </header>

      <AsistenteDocente
        disponible={disponible}
        asignaturas={asignaturas.map((a) => ({
          id: a.id,
          etiqueta: `${nombreCurso(a.curso)} · ${a.nombre}`,
        }))}
        cursos={ordenarCursos(cursos).map((c) => ({ id: c.id, etiqueta: nombreCurso(c) }))}
        banco={banco.map((b) => ({
          id: b.id,
          titulo: b.titulo,
          asignatura: b.asignatura,
          nivel: b.nivel,
          tipoMaterial: b.tipoMaterial,
          creadoEn: b.creadoEn.toISOString(),
          contenido: b.contenido as unknown as import("@/lib/ia/material").MaterialGenerado,
        }))}
      />
    </div>
  );
}
