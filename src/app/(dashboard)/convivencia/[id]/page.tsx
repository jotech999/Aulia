import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  puedeConvivencia,
  esEquipoConvivencia,
  NOMBRE_TIPO_SEGUIMIENTO,
  type EstadoCaso,
  type TipoSeguimiento,
} from "@/lib/convivencia";
import { hoyEnSantiago, isoDesdeFecha } from "@/lib/fecha";
import { GestionCaso } from "./seguimiento-cliente";
import { nombreCurso } from "@/lib/cursos";

const ESTADO_UI: Record<EstadoCaso, { label: string; badge: string }> = {
  ABIERTO: { label: "Abierto", badge: "bg-alerta-suave text-alerta border-alerta/20" },
  EN_SEGUIMIENTO: { label: "En seguimiento", badge: "bg-sky-50 text-sky-700 border-sky-200" },
  CERRADO: { label: "Cerrado", badge: "bg-superficie-3 text-tinta-tenue border-borde" },
};

function fmtLarga(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}

export default async function CasoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requerirSesion();
  if (!puedeConvivencia(user.rol)) notFound();
  const { id } = await params;

  const caso = await prisma.casoConvivencia.findFirst({
    where: { id, colegioId: user.colegioId, eliminadoEn: null },
    select: {
      id: true,
      categoria: true,
      titulo: true,
      descripcion: true,
      estado: true,
      abiertoEn: true,
      estudianteId: true,
      responsableId: true,
      estudiante: {
        select: {
          nombres: true,
          apellidos: true,
          matriculas: {
            where: { estado: "ACTIVA" },
            select: { curso: { select: { nivel: true, letra: true, profesorJefeId: true } } },
            take: 1,
          },
        },
      },
      seguimientos: {
        select: { id: true, tipo: true, texto: true, fecha: true, autorId: true, creadoEn: true },
        orderBy: { fecha: "desc" },
      },
    },
  });
  if (!caso) notFound();

  // Autorización de pertenencia: el profesor jefe solo su jefatura.
  const curso = caso.estudiante.matriculas[0]?.curso;
  if (!esEquipoConvivencia(user.rol) && curso?.profesorJefeId !== user.id) {
    notFound();
  }

  // Nombres de autores/responsable (una query).
  const usuarioIds = [
    ...new Set([caso.responsableId, ...caso.seguimientos.map((s) => s.autorId)]),
  ];
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: usuarioIds } },
    select: { id: true, nombre: true },
  });
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const ui = ESTADO_UI[caso.estado as EstadoCaso];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/convivencia" className="text-xs text-tinta-tenue hover:text-tinta-suave">
        ← Volver a convivencia
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{caso.titulo}</h1>
          <p className="mt-0.5 text-sm text-tinta-tenue">
            {caso.estudiante.apellidos}, {caso.estudiante.nombres}
            {curso && ` · ${nombreCurso(curso)}`} · {caso.categoria}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${ui.badge}`}>
          {ui.label}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-borde bg-superficie p-4 shadow-suave">
        <p className="whitespace-pre-wrap text-sm text-tinta">{caso.descripcion}</p>
        <p className="mt-3 text-xs text-tinta-tenue">
          Responsable: {nombre.get(caso.responsableId) ?? "—"} · abierto{" "}
          {isoDesdeFecha(caso.abiertoEn)}
        </p>
      </div>

      <GestionCaso
        casoId={caso.id}
        estado={caso.estado as EstadoCaso}
        hoy={hoyEnSantiago()}
      />

      <h2 className="mt-6 text-sm font-semibold text-tinta">
        Historial de seguimientos
      </h2>
      {caso.seguimientos.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-6 text-center text-sm text-tinta-tenue">
          Aún no hay seguimientos.
        </div>
      ) : (
        <ol className="mt-3 space-y-2">
          {caso.seguimientos.map((s) => (
            <li key={s.id} className="rounded-xl border border-borde bg-superficie p-4 shadow-suave">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-superficie-3 px-1.5 py-0.5 text-xs font-semibold text-tinta-suave">
                  {NOMBRE_TIPO_SEGUIMIENTO[s.tipo as TipoSeguimiento]}
                </span>
                <span className="text-xs text-tinta-tenue">{fmtLarga(isoDesdeFecha(s.fecha))}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-tinta">{s.texto}</p>
              <p className="mt-2 text-xs text-tinta-tenue">{nombre.get(s.autorId) ?? "—"}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
