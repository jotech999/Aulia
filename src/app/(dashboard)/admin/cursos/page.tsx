import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { whereCursosVisibles } from "@/lib/alcance-estudiantes";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";

export default async function CursosPage() {
  const sesion = await requerirRol("ADMIN", "DIRECTOR", "UTP", "INSPECTOR", "PROFESOR_JEFE", "PROFESOR");

  const cursos = await prisma.curso.findMany({
    where: whereCursosVisibles(sesion.user),
    include: {
      profesorJefe: { select: { nombre: true } },
      anioEscolar: { select: { anio: true } },
      _count: { select: { matriculas: { where: { colegioId: sesion.user.colegioId, estado: "ACTIVA" } } } },
    },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });

  return (
    <div>
      <EncabezadoPagina
        icono="cursos"
        titulo="Cursos"
        descripcion="Estructura académica del año escolar"
      />

      {cursos.length === 0 ? (
        <EstadoVacio
          icono="cursos"
          titulo="Aún no hay cursos"
          descripcion="Importa los cursos del año desde una planilla para empezar a organizar tu colegio."
          accion={{ href: "/admin/importar", etiqueta: "Importar cursos" }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borde bg-superficie-2 text-xs uppercase tracking-wide text-tinta-tenue">
              <tr>
                <th className="px-4 py-3">Curso</th>
                <th className="px-4 py-3">Año</th>
                <th className="px-4 py-3">Profesor(a) jefe</th>
                <th className="px-4 py-3 text-right">Estudiantes</th>
                <th className="px-4 py-3 text-right">Boletines</th>
              </tr>
            </thead>
            <tbody>
              {ordenarCursos(cursos).map((curso) => (
                <tr
                  key={curso.id}
                  className="border-b border-borde last:border-0 transition-colors hover:bg-superficie-2"
                >
                  <td className="px-4 py-3 font-semibold text-tinta">
                    {nombreCurso(curso)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-tinta-suave">
                    {curso.anioEscolar.anio}
                  </td>
                  <td className="px-4 py-3 text-tinta-suave">
                    {curso.profesorJefe?.nombre ?? (
                      <span className="text-tinta-tenue">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {curso._count.matriculas}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Boletines de TODO el curso en un PDF (una página por estudiante) */}
                    <span className="inline-flex gap-1.5 whitespace-nowrap">
                      <a
                        href={`/api/boletines/${curso.id}?periodo=1`}
                        target="_blank"
                        rel="noopener"
                        title={`Boletines 1er semestre · ${nombreCurso(curso)}`}
                        className="rounded-md border border-borde px-2 py-1 text-xs font-medium text-tinta-suave transition-colors hover:border-marca-500 hover:text-marca-600"
                      >
                        S1
                      </a>
                      <a
                        href={`/api/boletines/${curso.id}?periodo=2`}
                        target="_blank"
                        rel="noopener"
                        title={`Boletines 2º semestre · ${nombreCurso(curso)}`}
                        className="rounded-md border border-borde px-2 py-1 text-xs font-medium text-tinta-suave transition-colors hover:border-marca-500 hover:text-marca-600"
                      >
                        S2
                      </a>
                      <a
                        href={`/api/boletines/${curso.id}?anual=1`}
                        target="_blank"
                        rel="noopener"
                        title={`Boletines anuales · ${nombreCurso(curso)}`}
                        className="rounded-md border border-marca-300 bg-marca-50 px-2 py-1 text-xs font-semibold text-marca-700 transition-colors hover:bg-marca-100"
                      >
                        Anual
                      </a>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
