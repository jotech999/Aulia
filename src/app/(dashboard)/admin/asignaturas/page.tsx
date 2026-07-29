import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { colorAsignatura } from "@/lib/colores-asignatura";
import { SelectorColor } from "./selector-color";
import { nombreCurso } from "@/lib/cursos";


export default async function AsignaturasPage() {
  // Configurar la identidad visual del colegio es tarea de dirección/UTP/admin.
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP");

  const asignaturas = await prisma.asignatura.findMany({
    where: { colegioId: user.colegioId }, // regla multi-tenant
    select: {
      id: true,
      nombre: true,
      color: true,
      curso: { select: { id: true, nivel: true, letra: true } },
    },
    orderBy: [{ curso: { nivel: "asc" } }, { curso: { letra: "asc" } }, { nombre: "asc" }],
  });

  // Agrupar por curso, conservando el orden ya aplicado por la query.
  const porCurso = new Map<
    string,
    { nombre: string; items: typeof asignaturas }
  >();
  for (const a of asignaturas) {
    const g = porCurso.get(a.curso.id);
    if (g) g.items.push(a);
    else porCurso.set(a.curso.id, { nombre: nombreCurso(a.curso), items: [a] });
  }

  return (
    <div>
      <EncabezadoPagina
        icono="cursos"
        titulo="Colores de asignaturas"
        descripcion="Define el color de cada asignatura para el horario y el leccionario. “Auto” usa la convención chilena por nombre (rojo = Lenguaje, azul = Matemática…)."
      />

      {asignaturas.length === 0 ? (
        <EstadoVacio
          icono="cursos"
          titulo="Aún no hay asignaturas"
          descripcion="Las asignaturas se crean junto con los cursos. Importa tus cursos para empezar."
          accion={{ href: "/admin/importar", etiqueta: "Importar cursos" }}
        />
      ) : (
        <div className="space-y-6">
          {[...porCurso.values()].map((grupo) => (
            <section key={grupo.nombre}>
              <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-tinta-tenue">
                {grupo.nombre}
              </h2>
              <ul className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
                {grupo.items.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3 last:border-0"
                  >
                    <span className="flex items-center gap-2 font-medium text-tinta">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorAsignatura(a.nombre, a.color).punto}`}
                        aria-hidden
                      />
                      {a.nombre}
                      {a.color === null && (
                        <span className="text-[11px] font-normal text-tinta-tenue">
                          (auto)
                        </span>
                      )}
                    </span>
                    <SelectorColor
                      asignaturaId={a.id}
                      colorInicial={a.color}
                      puedeEditar
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
