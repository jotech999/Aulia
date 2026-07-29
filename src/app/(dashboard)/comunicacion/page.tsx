import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  alcancesPermitidos,
  puedeCrearComunicado,
  puedeVerReporte,
  NOMBRE_ALCANCE,
  type Alcance,
} from "@/lib/comunicados";
import { whereCursosAccesibles } from "../libro-clases/asistencia/consultas";
import { CrearComunicado } from "./crear-cliente";
import { ConfirmarLectura } from "./confirmar-cliente";
import { EliminarComunicado } from "./eliminar-cliente";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { ordenarCursos } from "@/lib/cursos";

function fmt(d: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function ComunicacionPage() {
  const { user } = await requerirSesion();

  // ── Vista del apoderado: comunicados de sus pupilos ────────────────────
  if (user.rol === "APODERADO") {
    const destinatarios = await prisma.comunicadoDestinatario.findMany({
      where: {
        apoderadoUsuarioId: user.id,
        colegioId: user.colegioId,
        comunicado: { eliminadoEn: null, estado: "PUBLICADO", esPlantilla: false },
      },
      select: {
        leidoEn: true,
        comunicado: {
          select: { id: true, titulo: true, cuerpo: true, creadoEn: true },
        },
      },
      orderBy: { comunicado: { creadoEn: "desc" } },
    });

    return (
      <div className="mx-auto max-w-2xl">
        <EncabezadoPagina
          icono="comunicacion"
          titulo="Comunicados"
          descripcion="Comunicados del colegio sobre tus pupilos."
        />
        {destinatarios.length === 0 ? (
          <EstadoVacio
            icono="comunicacion"
            titulo="No tienes comunicados"
            descripcion="Aquí aparecerán los comunicados del colegio sobre tus pupilos."
          />
        ) : (
          <ul className="mt-5 space-y-3">
            {destinatarios.map((d) => (
              <li
                key={d.comunicado.id}
                className="rounded-xl border border-borde bg-superficie p-4 shadow-suave"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-tinta">
                    {d.comunicado.titulo}
                  </h2>
                  {!d.leidoEn && (
                    <span className="rounded-md bg-marca-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                      Nuevo
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-tinta-tenue">
                  {fmt(d.comunicado.creadoEn)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-tinta">
                  {d.comunicado.cuerpo}
                </p>
                <div className="mt-3">
                  {d.leidoEn ? (
                    <span className="text-xs font-medium text-exito">
                      ✓ Lectura confirmada el {fmt(d.leidoEn)}
                    </span>
                  ) : (
                    <ConfirmarLectura comunicadoId={d.comunicado.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── Vista del staff: crear + listar con reporte de lectura ─────────────
  if (!puedeCrearComunicado(user.rol)) {
    return (
      <div>
        <EncabezadoPagina icono="comunicacion" titulo="Comunicación" />
        <p className="mt-4 text-sm text-tinta-suave">
          No tienes acceso a este módulo.
        </p>
      </div>
    );
  }

  const esGestion = user.rol === "ADMIN" || user.rol === "DIRECTOR" || user.rol === "UTP";
  const verReporte = puedeVerReporte(user.rol);

  const cursos = await prisma.curso.findMany({
    where: whereCursosAccesibles(user),
    select: { id: true, nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });
  const niveles = [...new Set(cursos.map((c) => c.nivel))];

  const matriculas = await prisma.matricula.findMany({
    where: {
      colegioId: user.colegioId,
      estado: "ACTIVA",
      cursoId: { in: cursos.map((c) => c.id) },
    },
    select: {
      estudiante: { select: { id: true, nombres: true, apellidos: true } },
    },
    orderBy: { estudiante: { apellidos: "asc" } },
  });
  const estudiantes = matriculas.map((m) => ({
    id: m.estudiante.id,
    nombre: `${m.estudiante.apellidos}, ${m.estudiante.nombres}`,
  }));

  const comunicados = await prisma.comunicado.findMany({
    where: {
      colegioId: user.colegioId,
      eliminadoEn: null,
      ...(esGestion ? {} : { autorId: user.id }),
    },
    select: {
      id: true,
      titulo: true,
      cuerpo: true,
      alcance: true,
      estado: true,
      programadoPara: true,
      esPlantilla: true,
      nombrePlantilla: true,
      creadoEn: true,
      autorId: true,
      _count: { select: { destinatarios: true } },
    },
    orderBy: { creadoEn: "desc" },
    take: 50,
  });

  const ids = comunicados.map((c) => c.id);
  const leidosAgg = ids.length
    ? await prisma.comunicadoDestinatario.groupBy({
        by: ["comunicadoId"],
        where: {
          comunicadoId: { in: ids },
          colegioId: user.colegioId,
          leidoEn: { not: null },
        },
        _count: { _all: true },
      })
    : [];
  const leidosPor = new Map(leidosAgg.map((g) => [g.comunicadoId, g._count._all]));

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        icono="comunicacion"
        titulo="Comunicación"
        descripcion="Comunicados a las familias con confirmación de lectura."
      />

      <div className="mt-5">
        <CrearComunicado
          contextoBorrador={`${user.colegioId}:${user.id}`}
          alcances={alcancesPermitidos(user.rol)}
          cursos={ordenarCursos(cursos)}
          niveles={niveles}
          estudiantes={estudiantes}
          plantillas={comunicados
            .filter((comunicado) => comunicado.esPlantilla)
            .map((comunicado) => ({
              nombre: comunicado.nombrePlantilla ?? comunicado.titulo,
              titulo: comunicado.titulo,
              cuerpo: comunicado.cuerpo,
            }))}
        />
      </div>

      {comunicados.length === 0 ? (
        <EstadoVacio
          icono="comunicacion"
          titulo="Aún no has enviado comunicados"
          descripcion="Crea el primer comunicado con el formulario de arriba para informar a las familias."
        />
      ) : (
        <ul className="mt-6 space-y-2">
          {comunicados.filter((comunicado) => !comunicado.esPlantilla).map((c) => {
            const total = c._count.destinatarios;
            const leidos = leidosPor.get(c.id) ?? 0;
            const puedeBorrar = esGestion || c.autorId === user.id;
            return (
              <li
                key={c.id}
                className="rounded-xl border border-borde bg-superficie p-4 shadow-suave"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-tinta">{c.titulo}</span>
                      <span className="rounded-md bg-superficie-3 px-1.5 py-0.5 text-xs font-medium text-tinta-tenue">
                        {NOMBRE_ALCANCE[c.alcance as Alcance]}
                      </span>
                      {c.estado !== "PUBLICADO" && (
                        <span className="rounded-md bg-alerta-suave px-1.5 py-0.5 text-xs font-semibold text-alerta">
                          {c.estado === "PROGRAMADO" ? "Programado" : "Borrador"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-tinta-tenue">{fmt(c.creadoEn)}</p>
                  </div>
                  {puedeBorrar && <EliminarComunicado id={c.id} />}
                </div>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-tinta-suave">
                  {c.cuerpo}
                </p>
                {verReporte && (
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-superficie-3">
                      <div
                        className="h-full bg-exito"
                        style={{ width: `${total ? (leidos / total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="font-medium text-tinta-suave">
                      {leidos}/{total} leídos
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
