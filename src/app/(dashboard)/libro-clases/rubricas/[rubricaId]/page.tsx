import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  autorizarLecturaRubrica,
  autorizarRubrica,
  ROLES_GESTION_RUBRICAS,
  type GuardarRubricaInput,
} from "@/lib/rubricas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Insignia } from "@/components/ui/insignia";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { EditorRubrica } from "../editor-rubrica";
import { asignaturasAccesiblesRubricas, oasParaEditor } from "../consultas";
import { AccionesRubrica } from "./acciones-rubrica";
import { VincularEvaluacion } from "./vincular-evaluacion";
import { VistaInstrumento } from "./vista-instrumento";

const tonoEstado = {
  BORRADOR: "alerta",
  PUBLICADA: "exito",
  ARCHIVADA: "neutra",
} as const;

const etiquetaEstado = {
  BORRADOR: "Borrador",
  PUBLICADA: "Publicada",
  ARCHIVADA: "Archivada",
} as const;

function fechaCorta(fecha: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(fecha);
}

export default async function DetalleRubricaPage({
  params,
}: {
  params: Promise<{ rubricaId: string }>;
}) {
  const { rubricaId } = await params;
  const { user } = await requerirSesion();
  const rubrica = await prisma.rubrica.findFirst({
    where: { id: rubricaId, colegioId: user.colegioId, eliminadaEn: null },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      tipo: true,
      estado: true,
      version: true,
      grupoVersionId: true,
      asignaturaId: true,
      publicadaEn: true,
      asignatura: {
        select: {
          id: true,
          nombre: true,
          docenteId: true,
          curso: {
            select: { id: true, nivel: true, letra: true, profesorJefeId: true },
          },
        },
      },
      oas: {
        select: { oa: { select: { codigo: true, eje: true, descripcion: true } } },
        orderBy: { oaCodigo: "asc" },
      },
      criterios: {
        orderBy: { orden: "asc" },
        select: {
          id: true,
          descripcion: true,
          peso: true,
          puntajeMax: true,
          niveles: {
            orderBy: { orden: "asc" },
            select: { id: true, etiqueta: true, descriptor: true, puntaje: true },
          },
        },
      },
    },
  });
  if (!rubrica || !autorizarLecturaRubrica(user.rol, user.id, rubrica.asignatura, rubrica.estado)) {
    notFound();
  }

  const puedeEditar = autorizarRubrica(user.rol, user.id, rubrica.asignatura);
  const esGestion = ROLES_GESTION_RUBRICAS.has(user.rol);
  const asignaturas = await asignaturasAccesiblesRubricas(user);
  const idsAsignaturas = asignaturas.map((asignatura) => asignatura.id);
  const [oasEditor, evaluacionesVinculadas, evaluacionesDisponibles, versionesGrupo] = await Promise.all([
    rubrica.estado === "BORRADOR" && puedeEditar
      ? oasParaEditor(asignaturas, esGestion)
      : Promise.resolve([]),
    prisma.evaluacion.findMany({
      where: {
        colegioId: user.colegioId,
        rubricaId: rubrica.id,
        asignaturaId: { in: idsAsignaturas },
        eliminadaEn: null,
      },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        fecha: true,
        asignatura: {
          select: { nombre: true, curso: { select: { nivel: true, letra: true } } },
        },
        _count: { select: { aplicacionesRubrica: true } },
      },
      orderBy: { fecha: "desc" },
    }),
    rubrica.estado === "PUBLICADA"
      ? prisma.evaluacion.findMany({
          where: {
            colegioId: user.colegioId,
            rubricaId: null,
            eliminadaEn: null,
            asignaturaId: rubrica.asignaturaId
              ? rubrica.asignaturaId
              : { in: idsAsignaturas },
          },
          select: {
            id: true,
            nombre: true,
            fecha: true,
            asignatura: {
              select: { nombre: true, curso: { select: { nivel: true, letra: true } } },
            },
          },
          orderBy: { fecha: "desc" },
        })
      : Promise.resolve([]),
    prisma.rubrica.findMany({
      where: {
        colegioId: user.colegioId,
        grupoVersionId: rubrica.grupoVersionId,
        eliminadaEn: null,
      },
      select: { id: true, version: true, estado: true },
      orderBy: { version: "desc" },
    }),
  ]);

  const criterios = rubrica.criterios.map((criterio) => ({
    id: criterio.id,
    descripcion: criterio.descripcion,
    peso: Number(criterio.peso),
    puntajeMax: Number(criterio.puntajeMax),
    niveles: criterio.niveles.map((nivel) => ({
      id: nivel.id,
      etiqueta: nivel.etiqueta,
      descriptor: nivel.descriptor,
      puntaje: Number(nivel.puntaje),
    })),
  }));
  const inicial: GuardarRubricaInput = {
    asignaturaId: rubrica.asignaturaId,
    nombre: rubrica.nombre,
    descripcion: rubrica.descripcion ?? "",
    tipo: rubrica.tipo,
    oaCodigos: rubrica.oas.map(({ oa }) => oa.codigo),
    criterios: criterios.map((criterio) => ({
      descripcion: criterio.descripcion,
      peso: criterio.peso,
      niveles: criterio.niveles.map((nivel) => ({
        etiqueta: nivel.etiqueta,
        descriptor: nivel.descriptor,
        puntaje: nivel.puntaje,
      })),
    })),
  };

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo={rubrica.nombre}
        descripcion={`${rubrica.tipo === "RUBRICA" ? "Rúbrica" : "Pauta de cotejo"} · versión ${rubrica.version}`}
        volver={{ href: "/libro-clases/rubricas", etiqueta: "Volver al banco" }}
        acciones={puedeEditar ? <AccionesRubrica rubricaId={rubrica.id} estado={rubrica.estado} /> : undefined}
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Resumen del instrumento">
        <div className="superficie rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">Estado</p>
          <div className="mt-2">
            <Insignia tono={tonoEstado[rubrica.estado]} punto>{etiquetaEstado[rubrica.estado]}</Insignia>
          </div>
          {rubrica.publicadaEn && <p className="mt-2 text-xs text-tinta-tenue">Publicada el {fechaCorta(rubrica.publicadaEn)}</p>}
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">Contexto</p>
          <p className="mt-2 text-sm font-semibold text-tinta">
            {rubrica.asignatura
              ? `${rubrica.asignatura.nombre} · ${rubrica.asignatura.curso.nivel} ${rubrica.asignatura.curso.letra}`
              : "Institucional / reutilizable"}
          </p>
        </div>
        <div className="superficie rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">Estructura</p>
          <p className="mt-2 text-sm font-semibold text-tinta">
            {rubrica.criterios.length} criterios · {rubrica.oas.length} OA
          </p>
        </div>
      </section>

      {versionesGrupo.length > 1 && (
        <nav className="mb-5 flex flex-wrap items-center gap-2" aria-label="Versiones del instrumento">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">Versiones</span>
          {versionesGrupo.map((version) => (
            <Link
              key={version.id}
              href={`/libro-clases/rubricas/${version.id}`}
              aria-current={version.id === rubrica.id ? "page" : undefined}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                version.id === rubrica.id
                  ? "border-marca-500 bg-marca-50 text-marca-700"
                  : "border-borde bg-superficie text-tinta-suave hover:bg-superficie-2"
              }`}
            >
              v{version.version} · {etiquetaEstado[version.estado]}
            </Link>
          ))}
        </nav>
      )}

      {rubrica.oas.length > 0 && rubrica.estado !== "BORRADOR" && (
        <details className="superficie mb-5 rounded-xl p-4">
          <summary className="cursor-pointer text-sm font-semibold text-tinta">
            Objetivos de Aprendizaje vinculados ({rubrica.oas.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {rubrica.oas.map(({ oa }) => (
              <li key={oa.codigo} className="rounded-lg bg-superficie-2 px-3 py-2 text-sm">
                <span className="font-semibold text-tinta">{oa.codigo}</span>
                <span className="ml-2 text-xs text-tinta-tenue">{oa.eje}</span>
                <p className="mt-0.5 text-xs text-tinta-suave">{oa.descripcion}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {rubrica.estado === "BORRADOR" && puedeEditar ? (
        <EditorRubrica
          rubricaId={rubrica.id}
          inicial={inicial}
          asignaturas={asignaturas.map((asignatura) => ({
            id: asignatura.id,
            nombre: asignatura.nombre,
            curso: `${asignatura.curso.nivel} ${asignatura.curso.letra}`,
          }))}
          oas={oasEditor}
          permiteGenerica={esGestion}
        />
      ) : (
        <VistaInstrumento criterios={criterios} />
      )}

      {rubrica.estado !== "BORRADOR" && (
        <section className="mt-7" aria-labelledby="evaluaciones-rubrica">
          <div className="mb-3">
            <h2 id="evaluaciones-rubrica" className="font-display text-lg font-semibold text-tinta">Evaluaciones</h2>
            <p className="mt-0.5 text-sm text-tinta-suave">
              La aplicación registra puntaje y retroalimentación. No crea una calificación automáticamente.
            </p>
          </div>

          {evaluacionesVinculadas.length === 0 ? (
            <EstadoVacio
              icono="calificaciones"
              titulo="Sin evaluaciones asociadas"
              descripcion={rubrica.estado === "PUBLICADA" ? "Asocia esta versión a una evaluación para comenzar a aplicarla." : "Este instrumento archivado no tuvo evaluaciones accesibles asociadas."}
            />
          ) : (
            <ul className="mb-4 grid gap-2 sm:grid-cols-2">
              {evaluacionesVinculadas.map((evaluacion) => (
                <li key={evaluacion.id}>
                  <Link
                    href={`/libro-clases/rubricas/${rubrica.id}/aplicar/${evaluacion.id}`}
                    className="superficie tarjeta-int flex items-center justify-between gap-3 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-400"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-tinta">{evaluacion.nombre}</p>
                      <p className="mt-0.5 text-xs text-tinta-tenue">
                        {evaluacion.asignatura.nombre} · {evaluacion.asignatura.curso.nivel} {evaluacion.asignatura.curso.letra} · {fechaCorta(evaluacion.fecha)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-marca-700">
                        {evaluacion._count.aplicacionesRubrica} aplicaciones registradas
                      </p>
                    </div>
                    <span className="shrink-0 text-tinta-tenue" aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {rubrica.estado === "PUBLICADA" && (
            <div className="superficie rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-tinta">Usar en otra evaluación</h3>
              <p className="mb-3 mt-0.5 text-xs text-tinta-suave">
                Solo se muestran evaluaciones de asignaturas que tienes autorizadas y que aún no tienen instrumento.
              </p>
              <VincularEvaluacion
                rubricaId={rubrica.id}
                evaluaciones={evaluacionesDisponibles.map((evaluacion) => ({
                  id: evaluacion.id,
                  etiqueta: `${evaluacion.nombre} · ${evaluacion.asignatura.nombre} · ${evaluacion.asignatura.curso.nivel} ${evaluacion.asignatura.curso.letra}`,
                }))}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
