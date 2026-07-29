import Link from "next/link";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import {
  esEstadoJustificacion,
  ESTADOS_JUSTIFICACION,
  PRESENTACION_ESTADO_JUSTIFICACION,
  type EstadoJustificacionVista,
} from "@/lib/justificaciones";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import {
  descifrarDetalleJustificacion,
  descifrarFundamentoJustificacion,
  descifrarMotivoJustificacion,
} from "@/lib/cifrado-justificacion";
import { BandejaJustificaciones, type JustificacionBandeja } from "./bandeja-cliente";
import { nombreCurso } from "@/lib/cursos";

const OPCIONES = ["PENDIENTE", "APROBADA", "RECHAZADA", "ANULADA", "TODAS"] as const;

export default async function JustificacionesInspectoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "INSPECTOR");
  const { estado: estadoSolicitado } = await searchParams;
  const estadoActivo = estadoSolicitado === "TODAS" || esEstadoJustificacion(estadoSolicitado)
    ? estadoSolicitado
    : "PENDIENTE";
  const filtroEstado = estadoActivo === "TODAS" ? undefined : estadoActivo;

  const [justificaciones, conteosAgrupados] = await Promise.all([
    prisma.justificacionInasistencia.findMany({
      where: {
        colegioId: user.colegioId,
        estudiante: { colegioId: user.colegioId },
        ...(filtroEstado ? { estado: filtroEstado } : {}),
      },
      orderBy: [{ fecha: "desc" }, { creadaEn: "desc" }],
      take: 100,
      select: {
        id: true,
        fecha: true,
        motivo: true,
        detalle: true,
        estado: true,
        creadaEn: true,
        revisadaEn: true,
        fundamentoRevision: true,
        estudiante: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            matriculas: {
              where: { estado: "ACTIVA", retiradaEn: null, colegioId: user.colegioId },
              take: 1,
              select: { curso: { select: { nivel: true, letra: true } } },
            },
          },
        },
      },
    }),
    prisma.justificacionInasistencia.groupBy({
      by: ["estado"],
      where: { colegioId: user.colegioId, estudiante: { colegioId: user.colegioId } },
      _count: { _all: true },
    }),
  ]);

  const conteos = Object.fromEntries(ESTADOS_JUSTIFICACION.map((estado) => [estado, 0])) as Record<
    EstadoJustificacionVista,
    number
  >;
  for (const item of conteosAgrupados) conteos[item.estado as EstadoJustificacionVista] = item._count._all;
  const total = ESTADOS_JUSTIFICACION.reduce((suma, estado) => suma + conteos[estado], 0);

  const items: JustificacionBandeja[] = justificaciones.map((justificacion) => {
    const curso = justificacion.estudiante.matriculas[0]?.curso;
    return {
      id: justificacion.id,
      fecha: justificacion.fecha.toISOString(),
      motivo: descifrarMotivoJustificacion(justificacion.motivo),
      detalle: descifrarDetalleJustificacion(justificacion.detalle),
      estado: justificacion.estado as EstadoJustificacionVista,
      creadaEn: justificacion.creadaEn.toISOString(),
      revisadaEn: justificacion.revisadaEn?.toISOString() ?? null,
      fundamentoRevision: descifrarFundamentoJustificacion(justificacion.fundamentoRevision),
      estudiante: {
        id: justificacion.estudiante.id,
        nombre: `${justificacion.estudiante.nombres} ${justificacion.estudiante.apellidos}`,
        curso: curso ? nombreCurso(curso) : null,
      },
    };
  });

  return (
    <div className="animar-surgir">
      <EncabezadoPagina
        icono="asistencia"
        titulo="Justificaciones"
        descripcion="Revisa los antecedentes enviados por las familias. La decisión no modifica la asistencia registrada."
      />

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar justificaciones por estado">
        {OPCIONES.map((opcion) => {
          const activa = estadoActivo === opcion;
          const etiqueta = opcion === "TODAS" ? "Todas" : PRESENTACION_ESTADO_JUSTIFICACION[opcion].etiqueta;
          const cantidad = opcion === "TODAS" ? total : conteos[opcion];
          return (
            <Link
              key={opcion}
              href={`/inspector/justificaciones?estado=${opcion}`}
              aria-current={activa ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                activa
                  ? "border-marca-500 bg-marca-50 text-marca-700"
                  : "border-borde bg-superficie text-tinta-suave hover:bg-superficie-2"
              }`}
            >
              {etiqueta}
              <span className="rounded-full bg-superficie-3 px-2 py-0.5 text-xs tabular-nums">{cantidad}</span>
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EstadoVacio
          icono="asistencia"
          titulo={estadoActivo === "PENDIENTE" ? "No hay justificaciones pendientes" : "No hay resultados en este estado"}
          descripcion={
            estadoActivo === "PENDIENTE"
              ? "Cuando una familia envíe antecedentes de una inasistencia aparecerán aquí."
              : "Prueba con otro filtro para consultar el historial."
          }
          accion={estadoActivo === "PENDIENTE" ? undefined : { href: "/inspector/justificaciones?estado=TODAS", etiqueta: "Ver todas" }}
        />
      ) : (
        <BandejaJustificaciones justificaciones={items} />
      )}
    </div>
  );
}
