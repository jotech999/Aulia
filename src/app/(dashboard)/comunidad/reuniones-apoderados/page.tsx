import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { hoyEnSantiago, isoDesdeFecha } from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioReunion } from "./formulario-reunion";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";
import { KitReunion } from "./kit-ia";
import { iaDisponible } from "@/lib/ia/cliente";

const ROLES = new Set(["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE"]);

function fechaLegible(fecha: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(fecha);
}

export default async function ReunionesApoderadosPage({
  searchParams,
}: {
  searchParams: Promise<{ cursoId?: string }>;
}) {
  const { user } = await requerirSesion();
  if (!ROLES.has(user.rol)) redirect("/dashboard");
  const parametros = await searchParams;

  const cursos = await prisma.curso.findMany({
    where: {
      colegioId: user.colegioId,
      ...(user.rol === "PROFESOR_JEFE" ? { profesorJefeId: user.id } : {}),
    },
    select: { id: true, nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });
  const curso = cursos.find((item) => item.id === parametros.cursoId) ?? cursos[0];

  const [matriculas, reuniones] = curso
    ? await Promise.all([
        prisma.matricula.findMany({
          where: { colegioId: user.colegioId, cursoId: curso.id, estado: "ACTIVA" },
          select: {
            estudiante: {
              select: {
                id: true,
                nombres: true,
                apellidos: true,
                apoderados: {
                  select: {
                    id: true,
                    parentesco: true,
                    calidad: true,
                    usuario: { select: { nombre: true } },
                  },
                  orderBy: [{ calidad: "asc" }, { usuario: { nombre: "asc" } }],
                },
              },
            },
          },
          orderBy: { estudiante: { apellidos: "asc" } },
        }),
        prisma.reunionApoderados.findMany({
          where: { colegioId: user.colegioId, cursoId: curso.id, eliminadaEn: null },
          select: {
            id: true,
            fecha: true,
            horaInicio: true,
            horaFin: true,
            tema: true,
            objetivo: true,
            acuerdos: true,
            observaciones: true,
            asistentes: { where: { eliminadoEn: null }, select: { id: true } },
          },
          orderBy: [{ fecha: "desc" }, { horaInicio: "desc" }],
          take: 100,
        }),
      ])
    : [[], []] as const;

  const contactos = matriculas.flatMap((matricula) =>
    matricula.estudiante.apoderados.map((apoderado) => ({
      id: apoderado.id,
      estudianteId: matricula.estudiante.id,
      estudiante: `${matricula.estudiante.apellidos}, ${matricula.estudiante.nombres}`,
      nombre: apoderado.usuario.nombre,
      parentesco: apoderado.parentesco,
      calidad: apoderado.calidad,
    }))
  );

  return (
    <div className="mx-auto max-w-5xl">
      <EncabezadoPagina
        icono="comunicacion"
        titulo="Reuniones de apoderados"
        descripcion="Convocatorias y actas de curso con horario, asistencia y acuerdos."
        volver={{ href: "/comunicacion", etiqueta: "Comunidad" }}
      />

      {curso && (
        <div className="mb-5">
          <FormularioReunion
            cursoId={curso.id}
            cursoNombre={nombreCurso(curso)}
            hoy={hoyEnSantiago()}
            contactos={contactos}
          />
        </div>
      )}

      {cursos.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {ordenarCursos(cursos).map((item) => (
            <Link
              key={item.id}
              href={`/comunidad/reuniones-apoderados?cursoId=${item.id}`}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${item.id === curso?.id ? "border-marca-500 bg-marca-50 text-marca-700" : "border-borde text-tinta-suave"}`}
            >
              {nombreCurso(item)}
            </Link>
          ))}
        </div>
      )}

      {curso && <KitReunion cursoId={curso.id} disponible={iaDisponible()} />}

      {!curso ? (
        <EstadoVacio icono="comunicacion" titulo="Sin cursos a cargo" descripcion="Cuando tengas una jefatura o cursos autorizados, podrás registrar sus reuniones aquí." />
      ) : reuniones.length === 0 ? (
        <EstadoVacio icono="comunicacion" titulo="Sin reuniones registradas" descripcion={`La primera acta de ${nombreCurso(curso)} aparecerá en este espacio.`} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {reuniones.map((reunion) => (
            <li key={reunion.id} className="rounded-2xl border border-borde bg-superficie p-5 shadow-suave">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-marca-600">{fechaLegible(reunion.fecha)}</p>
                  <h2 className="mt-1 font-display text-lg font-semibold">{reunion.tema}</h2>
                </div>
                <span className="rounded-lg bg-superficie-3 px-2.5 py-1 text-xs font-semibold tabular-nums text-tinta-suave">
                  {reunion.horaInicio}–{reunion.horaFin}
                </span>
              </div>
              {reunion.objetivo && <p className="mt-3 text-sm text-tinta-suave">{reunion.objetivo}</p>}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-tinta-tenue">
                <span className="rounded-full border border-borde px-2.5 py-1">{reunion.asistentes.length} asistentes</span>
                <span className="rounded-full border border-borde px-2.5 py-1">Acta {isoDesdeFecha(reunion.fecha)}</span>
              </div>
              {reunion.acuerdos && (
                <div className="mt-4 rounded-xl bg-marca-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-marca-700">Acuerdos</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-tinta-suave">{reunion.acuerdos}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
