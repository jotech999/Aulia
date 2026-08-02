import { requerirRol } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { nombreCurso } from "@/lib/cursos";

export const metadata = { title: "Apoderados por curso" };


export default async function Page({ searchParams }: { searchParams: Promise<{ cursoId?: string }> }) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP");
  const sp = await searchParams;

  const cursos = await prisma.curso.findMany({
    where: { colegioId: user.colegioId },
    select: {
      id: true,
      nivel: true,
      letra: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: {
          estudiante: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              apoderados: { select: { parentesco: true, usuario: { select: { nombre: true, email: true } } } },
            },
          },
        },
        orderBy: { estudiante: { apellidos: "asc" } },
      },
    },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });

  const cursoSel = sp.cursoId ? cursos.find((c) => c.id === sp.cursoId) : cursos[0];

  // Cobertura global: estudiantes con al menos un apoderado.
  const totalEst = cursos.reduce((s, c) => s + c.matriculas.length, 0);
  const conApo = cursos.reduce(
    (s, c) => s + c.matriculas.filter((m) => m.estudiante.apoderados.length > 0).length,
    0
  );
  const coberturaPct = totalEst ? Math.round((conApo / totalEst) * 100) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <EncabezadoPagina
        icono="convivencia"
        titulo="Apoderados por curso"
        descripcion="Contacto de los apoderados de cada curso y cobertura de vinculación."
      />

      {/* Resumen de cobertura */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-borde bg-superficie p-4 text-center">
          <p className="cifra text-2xl text-tinta">{totalEst}</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">Estudiantes</p>
        </div>
        <div className="rounded-xl border border-borde bg-superficie p-4 text-center">
          <p className="cifra text-2xl text-tinta">{conApo}</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">Con apoderado</p>
        </div>
        <div className={`rounded-xl border p-4 text-center ${coberturaPct !== null && coberturaPct < 90 ? "border-alerta/25 bg-alerta-suave" : "border-borde bg-superficie"}`}>
          <p className={`cifra text-2xl ${coberturaPct !== null && coberturaPct < 90 ? "text-alerta" : "text-tinta"}`}>{coberturaPct === null ? "—" : `${coberturaPct}%`}</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">Cobertura</p>
        </div>
      </div>

      {/* Selector de curso */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {cursos.map((c) => (
          <a
            key={c.id}
            href={`/admin/apoderados?cursoId=${c.id}`}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${cursoSel?.id === c.id ? "border-marca-500 bg-marca-50 text-marca-700" : "border-borde text-tinta-suave hover:bg-superficie-2"}`}
          >
            {nombreCurso(c)}
          </a>
        ))}
      </div>

      {!cursoSel ? (
        <div className="rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
          No hay cursos.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-borde bg-superficie-2 text-xs uppercase tracking-wide text-tinta-tenue">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Estudiante</th>
                <th className="px-4 py-2.5 font-semibold">Apoderado(s)</th>
              </tr>
            </thead>
            <tbody>
              {cursoSel.matriculas.map((m) => {
                const e = m.estudiante;
                return (
                  <tr key={e.id} className="border-t border-borde align-top">
                    <td className="px-4 py-2.5 font-medium text-tinta">{e.apellidos}, {e.nombres}</td>
                    <td className="px-4 py-2.5">
                      {e.apoderados.length === 0 ? (
                        <span className="inline-flex items-center rounded-md bg-alerta-suave px-2 py-0.5 text-xs font-medium text-alerta">Sin apoderado</span>
                      ) : (
                        <ul className="space-y-1">
                          {e.apoderados.map((a, i) => (
                            <li key={i} className="text-tinta-suave">
                              <span className="font-medium text-tinta">{a.usuario.nombre}</span>
                              <span className="text-tinta-tenue"> · {a.parentesco} · </span>
                              <a href={`mailto:${a.usuario.email}`} className="text-marca-600 hover:underline">{a.usuario.email}</a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
