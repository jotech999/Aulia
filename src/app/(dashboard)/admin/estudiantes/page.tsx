import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatearRut } from "@/lib/rut";
import { requerirRol } from "@/lib/sesion";
import { celdaClase } from "@/lib/densidad";
import { leerDensidad } from "@/lib/densidad-servidor";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Avatar } from "@/components/ui/avatar";
import { DensidadToggle } from "@/components/ui/densidad-toggle";
import { FiltrosEstudiantes } from "./filtros-cliente";
import { normalizar } from "@/components/paleta/comandos";
import { whereCursosVisibles, whereEstudiantesVisibles } from "@/lib/alcance-estudiantes";
import { nombreCurso } from "@/lib/cursos";


export default async function EstudiantesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; curso?: string }>;
}) {
  // El roster de menores (nombre + RUT) es dato sensible (Ley 21.719): solo
  // staff, nunca apoderados. Alinea el guard con la ficha de detalle.
  const sesion = await requerirRol(
    "ADMIN",
    "DIRECTOR",
    "UTP",
    "PROFESOR_JEFE",
    "PROFESOR",
    "INSPECTOR"
  );
  const densidad = await leerDensidad();
  const celda = celdaClase(densidad);
  const compacto = densidad === "compacto";

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const cursoId = sp.curso ?? "";
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 4);

  const [todos, cursos] = await Promise.all([
    prisma.estudiante.findMany({
      where: {
        ...whereEstudiantesVisibles(sesion.user),
        // El curso se filtra en la BD (exacto); el texto, en memoria, para ser
        // insensible a tildes (nombres chilenos: López, Muñoz, Peña…).
        ...(cursoId ? { matriculas: { some: { colegioId: sesion.user.colegioId, estado: "ACTIVA", cursoId } } } : {}),
      },
      include: {
        matriculas: {
          where: { colegioId: sesion.user.colegioId, estado: "ACTIVA" },
          include: { curso: { select: { nivel: true, letra: true } } },
          take: 1,
        },
      },
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
    }),
    prisma.curso.findMany({
      where: whereCursosVisibles(sesion.user),
      select: { id: true, nivel: true, letra: true },
      orderBy: [{ nivel: "asc" }, { letra: "asc" }],
    }),
  ]);

  const clavesQ = tokens.map((t) => normalizar(t.replace(/\./g, "")));
  const estudiantes = clavesQ.length
    ? todos.filter((e) => {
        const heno = normalizar(`${e.nombres} ${e.apellidos} ${e.rut}`);
        return clavesQ.every((t) => heno.includes(t));
      })
    : todos;

  const hayFiltro = q.length > 0 || cursoId.length > 0;

  return (
    <div>
      <EncabezadoPagina
        icono="estudiantes"
        titulo="Estudiantes"
        descripcion={`${estudiantes.length} ${estudiantes.length === 1 ? "estudiante" : "estudiantes"}${hayFiltro ? " (filtrados)" : " registrados"}`}
        acciones={<DensidadToggle densidad={densidad} />}
      />

      <FiltrosEstudiantes cursos={cursos.map((c) => ({ id: c.id, label: nombreCurso(c) }))} />

      {estudiantes.length === 0 ? (
        <EstadoVacio
          icono="estudiantes"
          titulo={hayFiltro ? "Sin resultados" : "Aún no hay estudiantes"}
          descripcion={
            hayFiltro
              ? "Ningún estudiante coincide con la búsqueda o el curso elegido. Prueba con otro término."
              : "Importa tu nómina desde tu plataforma anterior o una planilla y comienza a pasar lista."
          }
          accion={hayFiltro ? undefined : { href: "/admin/importar", etiqueta: "Importar estudiantes" }}
        />
      ) : (
        <div className="superficie overflow-x-auto rounded-xl">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-borde bg-superficie-2 text-xs uppercase tracking-wide text-tinta-tenue">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Estudiante</th>
                <th className="px-4 py-2.5 font-semibold">RUT</th>
                <th className="px-4 py-2.5 font-semibold">Curso</th>
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((e) => {
                const curso = e.matriculas[0]?.curso;
                return (
                  <tr
                    key={e.id}
                    className="group border-b border-borde/60 transition-colors last:border-0 hover:bg-superficie-2"
                  >
                    <td className={celda}>
                      <Link
                        href={`/admin/estudiantes/${e.id}`}
                        className="flex items-center gap-2.5 font-medium text-tinta"
                      >
                        {!compacto && (
                          <Avatar nombres={e.nombres} apellidos={e.apellidos} tamano="sm" />
                        )}
                        <span className="group-hover:underline">
                          {e.apellidos}, {e.nombres}
                        </span>
                      </Link>
                    </td>
                    <td className={`${celda} tabular-nums text-tinta-suave`}>{formatearRut(e.rut)}</td>
                    <td className={celda}>
                      {curso ? (
                        <span className="rounded-md bg-marca-50 px-2 py-0.5 text-xs font-semibold text-marca-600">
                          {curso.nivel} {curso.letra}
                        </span>
                      ) : (
                        <span className="text-tinta-tenue">Sin matrícula</span>
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
