import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { whereAsignaturasFirma } from "../firma/consultas";
import { construirHorario, DIAS_LABORALES, NOMBRE_DIA, type BloqueVista } from "@/lib/horario";
import { colorAsignatura } from "@/lib/colores-asignatura";
import { diaSemanaHoySantiago, fechaDesdeISO, hoyEnSantiago, isoDesdeFecha } from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { BotonImprimir } from "@/components/ui/boton-imprimir";
import { EditorHorario } from "./editor-horario";
import { VersionesHorario } from "./versiones-horario";
import { SelectorDocente } from "./selector-docente";
import { nombreCurso } from "@/lib/cursos";
const ROLES_DOCENTES = new Set(["PROFESOR", "PROFESOR_JEFE"]);
const ROLES_GESTION = new Set(["ADMIN", "DIRECTOR", "UTP"]);

export default async function HorarioPage({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string; asignaturaId?: string; docenteId?: string; editar?: string; versionId?: string }>;
}) {
  const { user } = await requerirSesion();
  const sp = await searchParams;
  const esDocente = ROLES_DOCENTES.has(user.rol);
  const puedeEditar = ROLES_GESTION.has(user.rol);

  const docentes = puedeEditar
    ? await prisma.usuario.findMany({
        where: {
          activo: true,
          membresias: {
            some: {
              colegioId: user.colegioId,
              activa: true,
              rol: { in: ["PROFESOR", "PROFESOR_JEFE"] },
            },
          },
          asignaturas: { some: { colegioId: user.colegioId } },
        },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      })
    : [];
  const docenteSeleccionado = esDocente
    ? { id: user.id, nombre: user.name ?? "Mi horario" }
    : docentes.find((docente) => docente.id === sp.docenteId) ?? null;

  const asignaturas = await prisma.asignatura.findMany({
    where: {
      AND: [
        whereAsignaturasFirma(user),
        docenteSeleccionado ? { docenteId: docenteSeleccionado.id } : {},
      ],
    },
    select: {
      id: true,
      nombre: true,
      color: true,
      curso: { select: { id: true, nivel: true, letra: true } },
      bloques: {
        where: { eliminadaEn: null },
        select: { id: true, dia: true, horaInicio: true, horaFin: true, horarioVersionId: true },
      },
    },
    orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
  });

  // Cursos distintos disponibles (para el selector de dirección/UTP/admin).
  const cursos = [
    ...new Map(asignaturas.map((a) => [a.curso.id, a.curso])).values(),
  ].sort((x, y) => nombreCurso(x).localeCompare(nombreCurso(y)));

  // Docente: por defecto ve TODA su semana (todas sus asignaturas). Dirección no
  // dicta clases, así que parte enfocada en un curso.
  const cursoSel = sp.cursoId ?? (docenteSeleccionado ? null : cursos[0]?.id ?? null);
  const versiones = cursoSel ? await prisma.horarioVersion.findMany({
    where: { colegioId: user.colegioId, horarioCurso: { colegioId: user.colegioId, cursoId: cursoSel } },
    select: { id: true, numero: true, estado: true, vigenteDesde: true, vigenteHasta: true },
    orderBy: [{ vigenteDesde: "desc" }, { numero: "desc" }],
  }) : [];
  const hoyFecha = fechaDesdeISO(hoyEnSantiago());
  const solicitada = versiones.find((v) => v.id === sp.versionId);
  const borrador = versiones.find((v) => v.estado === "BORRADOR");
  const vigente = versiones.find((v) => v.estado === "PUBLICADO" && v.vigenteDesde <= hoyFecha && (!v.vigenteHasta || v.vigenteHasta >= hoyFecha)) ?? versiones.find((v) => v.estado === "PUBLICADO");
  const versionSeleccionada = solicitada ?? (sp.editar === "1" ? borrador : null) ?? vigente ?? versiones[0] ?? null;
  const editando = puedeEditar && sp.editar === "1" && cursoSel !== null && versionSeleccionada?.estado === "BORRADOR";

  // Asignaturas disponibles según el curso elegido (2º filtro por categoría).
  const asignaturasVista = [
    ...new Map(
      asignaturas
        .filter((a) => (cursoSel ? a.curso.id === cursoSel : true))
        .map((a) => [a.id, { id: a.id, nombre: a.nombre, color: a.color }])
    ).values(),
  ].sort((x, y) => x.nombre.localeCompare(y.nombre));
  const asigSel = sp.asignaturaId && asignaturasVista.some((a) => a.id === sp.asignaturaId) ? sp.asignaturaId : null;
  const qs = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (cursoSel) p.set("cursoId", cursoSel);
    if (asigSel) p.set("asignaturaId", asigSel);
    if (!esDocente && docenteSeleccionado) p.set("docenteId", docenteSeleccionado.id);
    for (const [k, v] of Object.entries(extra)) v === null ? p.delete(k) : p.set(k, v);
    const s = p.toString();
    return `/libro-clases/horario${s ? `?${s}` : ""}`;
  };

  const bloques: BloqueVista[] = asignaturas
    .filter((a) => (cursoSel ? a.curso.id === cursoSel : true) && (asigSel ? a.id === asigSel : true))
    .flatMap((a) =>
      a.bloques
        .filter((b) => b.dia >= 1 && b.dia <= 5)
        .filter((b) => !versionSeleccionada || b.horarioVersionId === versionSeleccionada.id)
        .map((b) => ({
          dia: b.dia,
          horaInicio: b.horaInicio,
          horaFin: b.horaFin,
          asignaturaId: a.id,
          asignatura: a.nombre,
          color: a.color,
          curso: nombreCurso(a.curso),
        }))
    );

  const filas = construirHorario(bloques);
  const hoy = diaSemanaHoySantiago();
  // Mostrar el nombre del curso dentro de la celda solo cuando la vista mezcla
  // varios cursos (semana personal del docente sin filtrar).
  const mostrarCurso = cursoSel === null && cursos.length > 1;
  const mostrarHorasLibres = Boolean(docenteSeleccionado);
  const cursoActual = cursos.find((curso) => curso.id === cursoSel);
  const asignaturasEditor = asignaturas
    .filter((asignatura) => asignatura.curso.id === cursoSel)
    .map((asignatura) => ({
      id: asignatura.id,
      nombre: asignatura.nombre,
      color: asignatura.color,
    }));
  const bloquesEditor = asignaturas
    .filter((asignatura) => asignatura.curso.id === cursoSel)
    .flatMap((asignatura) =>
      asignatura.bloques.filter((bloque) => !versionSeleccionada || bloque.horarioVersionId === versionSeleccionada.id).map((bloque) => ({
        id: bloque.id,
        asignaturaId: asignatura.id,
        asignatura: asignatura.nombre,
        color: asignatura.color,
        dia: bloque.dia,
        horaInicio: bloque.horaInicio,
        horaFin: bloque.horaFin,
      }))
    );

  return (
    <div>
      <EncabezadoPagina
        icono="asistencia"
        titulo={
          editando
            ? "Editar horario"
            : esDocente && !cursoSel
              ? "Mi horario"
              : docenteSeleccionado
                ? `Horario de ${docenteSeleccionado.nombre}`
                : "Horario semanal"
        }
        descripcion={
          editando
            ? "Organiza los bloques del curso y evita cruces de sala o docente."
            : docenteSeleccionado
              ? "Clases y horas libres de la semana, con el color de cada asignatura."
              : "La semana de clases de un vistazo, con el color de cada asignatura."
        }
        acciones={puedeEditar && cursoSel ? <VersionesHorario cursoId={cursoSel} versionId={versionSeleccionada?.id ?? null} esBorrador={versionSeleccionada?.estado === "BORRADOR"} fechaSugerida={hoyEnSantiago()} /> : undefined}
      />

      {puedeEditar && docentes.length > 0 && !editando && (
        <div className="mb-4 flex justify-end">
          <SelectorDocente
            docentes={docentes}
            seleccionado={docenteSeleccionado?.id ?? null}
          />
        </div>
      )}

      {cursoSel && versiones.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">Vigencia</span>{versiones.map((v) => { const activa = v.id === versionSeleccionada?.id; const etiqueta = v.estado === "BORRADOR" ? `Borrador v${v.numero}` : v.vigenteDesde > hoyFecha ? `Próxima v${v.numero}` : v.vigenteHasta && v.vigenteHasta < hoyFecha ? `Histórica v${v.numero}` : `Actual v${v.numero}`; return <Link key={v.id} href={`/libro-clases/horario?cursoId=${cursoSel}&versionId=${v.id}${v.estado === "BORRADOR" ? "&editar=1" : ""}`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${activa ? "border-marca-500 bg-marca-50 text-marca-700" : "border-borde text-tinta-suave"}`}>{etiqueta} · {isoDesdeFecha(v.vigenteDesde)}</Link>; })}</div>}

      {/* Filtro 1 · Curso: siempre para dirección; para el docente como filtro opcional. */}
      {cursos.length > 0 && (docenteSeleccionado ? cursos.length > 1 : true) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">Curso</span>
          {docenteSeleccionado && (
            <ChipCurso
              href={`/libro-clases/horario${esDocente ? "" : `?docenteId=${docenteSeleccionado.id}`}`}
              activo={!cursoSel}
            >
              {esDocente ? "Toda mi semana" : "Toda la semana"}
            </ChipCurso>
          )}
          {cursos.map((c) => (
            <ChipCurso
              key={c.id}
              href={`/libro-clases/horario?cursoId=${c.id}${!esDocente && docenteSeleccionado ? `&docenteId=${docenteSeleccionado.id}` : ""}${editando ? "&editar=1" : ""}`}
              activo={cursoSel === c.id}
            >
              {nombreCurso(c)}
            </ChipCurso>
          ))}
        </div>
      )}

      {/* Filtro 2 · Asignatura (dentro del curso/semana elegida). */}
      {!editando && asignaturasVista.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">Asignatura</span>
          <ChipCurso href={qs({ asignaturaId: null })} activo={!asigSel}>Todas</ChipCurso>
          {asignaturasVista.map((a) => (
            <ChipCurso key={a.id} href={qs({ asignaturaId: a.id })} activo={asigSel === a.id}>
              <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${colorAsignatura(a.nombre, a.color).punto}`} aria-hidden />
              {a.nombre}
            </ChipCurso>
          ))}
        </div>
      )}

      {editando && cursoActual ? (
        <EditorHorario
          cursoNombre={nombreCurso(cursoActual)}
          horarioVersionId={versionSeleccionada!.id}
          asignaturas={asignaturasEditor}
          bloquesIniciales={bloquesEditor}
        />
      ) : (
        <>
      {filas.length > 0 && (
        <div className="mb-3 flex items-center justify-between" data-noprint>
          <span className="text-xs text-tinta-tenue">
            {bloques.length} {bloques.length === 1 ? "bloque" : "bloques"} en la semana
            {asignaturasVista.length > 1 && !asigSel ? ` · ${asignaturasVista.length} asignaturas` : ""}
          </span>
          <BotonImprimir>Imprimir horario</BotonImprimir>
        </div>
      )}

      {filas.length === 0 ? (
        <EstadoVacio
          icono="asistencia"
          titulo="Sin horario cargado"
          descripcion="Cuando el colegio configure los bloques horarios de las asignaturas, tu semana aparecerá aquí."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie shadow-suave">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className="sticky left-0 z-10 w-16 bg-superficie px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                  Hora
                </th>
                {DIAS_LABORALES.map((dia) => (
                  <th
                    key={dia}
                    className={`px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide ${
                      dia === hoy ? "bg-marca-50 text-marca-700" : "text-tinta-tenue"
                    }`}
                  >
                    {NOMBRE_DIA[dia]}
                    {dia === hoy && <span className="ml-1 text-marca-500">hoy</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr
                  key={fila.horaInicio}
                  className="border-b border-borde transition-colors last:border-0 hover:bg-superficie-2/60"
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-superficie px-2 py-2 align-top text-xs tabular-nums text-tinta-tenue">
                    <div className="font-semibold text-tinta-suave">{fila.horaInicio}</div>
                    <div>{fila.horaFin}</div>
                  </td>
                  {fila.celdas.map((celda, i) => {
                    const esHoy = DIAS_LABORALES[i] === hoy;
                    return (
                      <td
                        key={i}
                        className={`px-1.5 py-1.5 align-top transition-colors ${esHoy ? "border-x border-marca-200/60 bg-marca-50/60" : ""}`}
                      >
                        {celda ? (
                          <Link
                            href={`/libro-clases/firma?asignaturaId=${celda.asignaturaId}`}
                            title={`Ir al leccionario de ${celda.asignatura}`}
                            className={`block rounded-lg px-2 py-1.5 text-xs leading-tight transition-all duration-150 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-md hover:ring-2 hover:ring-marca-300 active:scale-[0.98] ${colorAsignatura(celda.asignatura, celda.color).suave}`}
                          >
                            <div className="font-semibold">{celda.asignatura}</div>
                            {mostrarCurso && celda.curso && (
                              <div className="opacity-70">{celda.curso}</div>
                            )}
                          </Link>
                        ) : (
                          mostrarHorasLibres ? (
                            <span className="block rounded-lg border border-dashed border-borde px-2 py-2 text-center text-[11px] font-medium text-tinta-tenue">
                              Hora libre
                            </span>
                          ) : (
                            <span className="sr-only">Libre</span>
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function ChipCurso({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        activo
          ? "border-marca-500 bg-marca-50 text-marca-700"
          : "border-borde text-tinta-suave hover:bg-superficie-3"
      }`}
    >
      {children}
    </Link>
  );
}
