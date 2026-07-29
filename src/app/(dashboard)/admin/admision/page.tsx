import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { AccionesPostulacion, CopiarEnlacePublico } from "./postulacion-cliente";

export const metadata = { title: "Admisión" };

type EstadoP = "RECIBIDA" | "EN_REVISION" | "ACEPTADA" | "RECHAZADA" | "MATRICULADA";

const ESTADO_UI: Record<EstadoP, { label: string; badge: string }> = {
  RECIBIDA: { label: "Recibida", badge: "bg-marca-50 text-marca-700 border-marca-200" },
  EN_REVISION: { label: "En revisión", badge: "bg-alerta-suave text-alerta border-alerta/25" },
  ACEPTADA: { label: "Aceptada", badge: "bg-exito-suave text-exito border-exito/25" },
  RECHAZADA: { label: "Rechazada", badge: "bg-peligro-suave text-peligro border-peligro/25" },
  MATRICULADA: { label: "Matriculada", badge: "bg-superficie-3 text-tinta-suave border-borde" },
};

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short" }).format(d);

/**
 * Bandeja de admisión: postulaciones recibidas desde el formulario público,
 * con gestión de estados y aviso automático por correo al apoderado.
 */
export default async function AdmisionPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const estadoSel =
    sp.estado && sp.estado in ESTADO_UI ? (sp.estado as EstadoP) : undefined;

  const [postulaciones, conteos] = await Promise.all([
    prisma.postulacion.findMany({
      where: { colegioId: user.colegioId, ...(estadoSel ? { estado: estadoSel } : {}) },
      orderBy: { creadaEn: "desc" },
      take: 200,
    }),
    prisma.postulacion.groupBy({
      by: ["estado"],
      where: { colegioId: user.colegioId },
      _count: { _all: true },
    }),
  ]);

  const total = conteos.reduce((s, c) => s + c._count._all, 0);
  const de = (e: EstadoP) => conteos.find((c) => c.estado === e)?._count._all ?? 0;
  const base = process.env.NEXTAUTH_URL ?? "";
  const urlPublica = `${base}/postulacion/${user.colegioId}`;

  return (
    <div>
      <EncabezadoPagina
        icono="estudiantes"
        titulo="Admisión"
        descripcion="Postulaciones recibidas desde el formulario público del colegio."
        acciones={<CopiarEnlacePublico url={urlPublica} />}
      />

      <p className="mt-2 text-xs text-tinta-tenue">
        Comparte el enlace público en la web o redes del colegio:{" "}
        <Link href={`/postulacion/${user.colegioId}`} className="font-medium text-marca-600 hover:text-marca-700">
          ver formulario →
        </Link>
      </p>

      {/* Filtros por estado */}
      <div className="mt-5 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
        <Link
          href="/admin/admision"
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
            !estadoSel
              ? "border-marca-500 bg-marca-50 text-marca-700"
              : "border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
          }`}
        >
          Todas ({total})
        </Link>
        {(Object.keys(ESTADO_UI) as EstadoP[]).map((e) => (
          <Link
            key={e}
            href={`/admin/admision?estado=${e}`}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              estadoSel === e
                ? "border-marca-500 bg-marca-50 text-marca-700"
                : "border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
            }`}
          >
            {ESTADO_UI[e].label} ({de(e)})
          </Link>
        ))}
      </div>

      {postulaciones.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-10 text-center text-sm text-tinta-tenue">
          {estadoSel
            ? "No hay postulaciones en este estado."
            : "Aún no llegan postulaciones. Comparte el enlace público para recibirlas."}
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {postulaciones.map((p) => {
            const ui = ESTADO_UI[p.estado as EstadoP];
            return (
              <li key={p.id} className="superficie rounded-xl p-4 transition-shadow hover:shadow-elevada">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-tinta">
                        {p.apellidos}, {p.nombres}
                      </span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${ui.badge}`}>
                        {ui.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-tinta-suave">
                      Postula a <strong>{p.nivelSolicitado}</strong> · recibida el {fmt(p.creadaEn)}
                    </p>
                    <p className="mt-0.5 text-xs text-tinta-tenue">
                      Apoderado/a: {p.apoderadoNombre} · {p.email}
                      {p.telefono ? ` · ${p.telefono}` : ""}
                    </p>
                    {p.comentario && (
                      <p className="mt-1.5 rounded-lg bg-superficie-2 px-3 py-2 text-xs text-tinta-suave">
                        “{p.comentario}”
                      </p>
                    )}
                  </div>
                  <AccionesPostulacion id={p.id} estado={p.estado as EstadoP} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
