import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { autorizarCrearAnotacion } from "@/lib/anotaciones";
import { whereCursosAccesibles } from "@/app/(dashboard)/libro-clases/asistencia/consultas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { AnotacionLote } from "./anotacion-lote-cliente";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";

export const metadata = { title: "Anotaciones" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string }>;
}) {
  const { user } = await requerirSesion();
  if (!autorizarCrearAnotacion(user.rol)) redirect("/dashboard");
  const sp = await searchParams;

  const cursos = await prisma.curso.findMany({
    where: whereCursosAccesibles(user),
    select: { id: true, nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });
  const cursoSel = sp.cursoId ? cursos.find((c) => c.id === sp.cursoId) : undefined;

  if (!cursoSel) {
    return (
      <div>
        <EncabezadoPagina
          icono="convivencia"
          titulo="Anotaciones"
          descripcion="Registra la misma anotación en la hoja de vida de varios estudiantes a la vez."
        />
        {cursos.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
            No tienes cursos asignados.
          </div>
        ) : (
          <ul className="surgir-secuencia grid gap-2 sm:grid-cols-2">
            {ordenarCursos(cursos).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/libro-clases/anotaciones?cursoId=${c.id}`}
                  className="superficie tarjeta-int flex items-center justify-between rounded-xl p-4"
                >
                  <span className="font-semibold">{nombreCurso(c)}</span>
                  <span className="text-tinta-tenue" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const matriculas = await prisma.matricula.findMany({
    where: { cursoId: cursoSel.id, colegioId: user.colegioId, estado: "ACTIVA" },
    select: { estudiante: { select: { id: true, nombres: true, apellidos: true } } },
    orderBy: { estudiante: { apellidos: "asc" } },
  });
  const estudiantes = matriculas.map((m) => ({
    id: m.estudiante.id,
    nombre: `${m.estudiante.apellidos}, ${m.estudiante.nombres}`,
  }));

  return (
    <div>
      <EncabezadoPagina
        icono="convivencia"
        titulo={`Anotaciones · ${nombreCurso(cursoSel)}`}
        descripcion="Selecciona estudiantes y registra la anotación en la hoja de vida de todos."
        volver={{ href: "/libro-clases/anotaciones", etiqueta: "Cambiar curso" }}
      />
      {estudiantes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
          Este curso no tiene estudiantes con matrícula activa.
        </div>
      ) : (
        <AnotacionLote cursoId={cursoSel.id} estudiantes={estudiantes} />
      )}
    </div>
  );
}
