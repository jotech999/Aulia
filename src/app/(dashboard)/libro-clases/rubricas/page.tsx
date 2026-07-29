import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { ROLES_GESTION_RUBRICAS } from "@/lib/rubricas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Insignia } from "@/components/ui/insignia";
import { BotonEnlace } from "@/components/ui/boton";

const etiquetaEstado = {
  BORRADOR: "Borrador",
  PUBLICADA: "Publicada",
  ARCHIVADA: "Archivada",
} as const;

const tonoEstado = {
  BORRADOR: "alerta",
  PUBLICADA: "exito",
  ARCHIVADA: "neutra",
} as const;

export default async function RubricasPage() {
  const { user } = await requerirSesion();
  const esGestion = ROLES_GESTION_RUBRICAS.has(user.rol);
  const esDocente = ["PROFESOR", "PROFESOR_JEFE"].includes(user.rol);

  if (!esGestion && !esDocente) {
    return (
      <div>
        <EncabezadoPagina
          icono="calificaciones"
          titulo="Rúbricas y pautas"
          descripcion="Instrumentos de evaluación y retroalimentación pedagógica."
        />
        <EstadoVacio
          icono="calificaciones"
          titulo="Acceso restringido"
          descripcion="Este módulo está disponible para docentes y equipos de gestión académica."
        />
      </div>
    );
  }

  const asignaturas = await prisma.asignatura.findMany({
    where: {
      colegioId: user.colegioId,
      ...(esGestion
        ? {}
        : {
            OR: [
              { docenteId: user.id },
              { curso: { profesorJefeId: user.id } },
            ],
          }),
    },
    select: {
      id: true,
      nombre: true,
      curso: { select: { nivel: true, letra: true } },
    },
    orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
  });
  const idsAsignatura = asignaturas.map((asignatura) => asignatura.id);

  const versiones = await prisma.rubrica.findMany({
    where: {
      colegioId: user.colegioId,
      eliminadaEn: null,
      ...(esGestion
        ? {}
        : {
            OR: [
              { asignaturaId: { in: idsAsignatura } },
              { asignaturaId: null, estado: "PUBLICADA" },
            ],
          }),
    },
    select: {
      id: true,
      grupoVersionId: true,
      version: true,
      nombre: true,
      descripcion: true,
      tipo: true,
      estado: true,
      actualizadaEn: true,
      asignatura: {
        select: {
          nombre: true,
          curso: { select: { nivel: true, letra: true } },
        },
      },
      _count: { select: { criterios: true, evaluaciones: true, aplicaciones: true } },
    },
    orderBy: [{ actualizadaEn: "desc" }, { version: "desc" }],
  });

  // El banco muestra una tarjeta por instrumento; el detalle conserva el
  // historial y permite abrir la versión vigente o el nuevo borrador.
  const porGrupo = new Map<string, (typeof versiones)[number]>();
  for (const rubrica of versiones) {
    const actual = porGrupo.get(rubrica.grupoVersionId);
    if (!actual || rubrica.version > actual.version) porGrupo.set(rubrica.grupoVersionId, rubrica);
  }
  const rubricas = [...porGrupo.values()].sort(
    (a, b) => b.actualizadaEn.getTime() - a.actualizadaEn.getTime()
  );
  const puedeCrear = esGestion || asignaturas.length > 0;

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo="Rúbricas y pautas"
        descripcion="Crea instrumentos reutilizables, publícalos por versión y retroalimenta sin convertir puntaje a nota automáticamente."
        acciones={
          puedeCrear ? (
            <BotonEnlace href="/libro-clases/rubricas/nueva">Nuevo instrumento</BotonEnlace>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-tinta-suave">
          {rubricas.length} instrumento{rubricas.length === 1 ? "" : "s"} en el banco
        </p>
        <p className="rounded-lg bg-superficie-2 px-3 py-1.5 text-xs text-tinta-tenue">
          Publicar fija el contenido de esa versión
        </p>
      </div>

      {rubricas.length === 0 ? (
        <EstadoVacio
          icono="calificaciones"
          titulo="Aún no hay instrumentos"
          descripcion="Crea una rúbrica o pauta de cotejo para reutilizarla en tus evaluaciones."
          accion={puedeCrear ? { href: "/libro-clases/rubricas/nueva", etiqueta: "Crear primer instrumento" } : undefined}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rubricas.map((rubrica) => (
            <li key={rubrica.id}>
              <Link
                href={`/libro-clases/rubricas/${rubrica.id}`}
                className="superficie tarjeta-int group flex h-full flex-col rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Insignia tono={tonoEstado[rubrica.estado]} punto>
                        {etiquetaEstado[rubrica.estado]}
                      </Insignia>
                      <span className="text-xs font-medium text-tinta-tenue">
                        {rubrica.tipo === "RUBRICA" ? "Rúbrica" : "Pauta de cotejo"} · v{rubrica.version}
                      </span>
                    </div>
                    <h2 className="mt-2 truncate font-display text-lg font-semibold text-tinta">
                      {rubrica.nombre}
                    </h2>
                  </div>
                  <span className="text-tinta-tenue transition-transform group-hover:translate-x-0.5" aria-hidden>
                    →
                  </span>
                </div>
                {rubrica.descripcion && (
                  <p className="mt-1 line-clamp-2 text-sm text-tinta-suave">{rubrica.descripcion}</p>
                )}
                <p className="mt-3 text-xs font-medium text-tinta-tenue">
                  {rubrica.asignatura
                    ? `${rubrica.asignatura.nombre} · ${rubrica.asignatura.curso.nivel} ${rubrica.asignatura.curso.letra}`
                    : "Instrumento institucional reutilizable"}
                </p>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-borde pt-3 text-xs text-tinta-suave">
                  <span>{rubrica._count.criterios} criterios</span>
                  <span>{rubrica._count.evaluaciones} evaluaciones</span>
                  <span>{rubrica._count.aplicaciones} aplicaciones</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
