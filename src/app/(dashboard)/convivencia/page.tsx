import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { puedeConvivencia, type EstadoCaso } from "@/lib/convivencia";
import { whereCasosAccesibles, whereEstudiantesAccesibles } from "./consultas";
import { NuevoCaso } from "./nuevo-cliente";

const ESTADO_UI: Record<EstadoCaso, { label: string; badge: string }> = {
  ABIERTO: { label: "Abierto", badge: "bg-alerta-suave text-alerta border-alerta/20" },
  EN_SEGUIMIENTO: { label: "En seguimiento", badge: "bg-sky-50 text-sky-700 border-sky-200" },
  CERRADO: { label: "Cerrado", badge: "bg-superficie-3 text-tinta-tenue border-borde" },
};

const ESTADOS_VALIDOS = new Set<EstadoCaso>(["ABIERTO", "EN_SEGUIMIENTO", "CERRADO"]);

function fmt(d: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function ConvivenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { user } = await requerirSesion();

  if (!puedeConvivencia(user.rol)) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Convivencia escolar</h1>
        <p className="mt-4 rounded-xl border border-borde bg-superficie p-4 text-sm text-tinta-tenue">
          Este módulo contiene información reservada del equipo de convivencia. No
          tienes acceso.
        </p>
      </div>
    );
  }

  // ── Filtros por URL: estado del caso + búsqueda por texto ─────────────────
  const sp = await searchParams;
  const estadoSel = ESTADOS_VALIDOS.has(sp.estado as EstadoCaso)
    ? (sp.estado as EstadoCaso)
    : undefined;
  const q = (sp.q ?? "").trim().slice(0, 80);

  const filtroTexto = q
    ? {
        OR: [
          { titulo: { contains: q, mode: "insensitive" as const } },
          { categoria: { contains: q, mode: "insensitive" as const } },
          { estudiante: { nombres: { contains: q, mode: "insensitive" as const } } },
          { estudiante: { apellidos: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const [casos, totalSinFiltro] = await Promise.all([
    prisma.casoConvivencia.findMany({
      where: {
        ...whereCasosAccesibles(user),
        ...(estadoSel ? { estado: estadoSel } : {}),
        ...filtroTexto,
      },
      select: {
        id: true,
        categoria: true,
        titulo: true,
        estado: true,
        abiertoEn: true,
        estudiante: { select: { nombres: true, apellidos: true } },
        _count: { select: { seguimientos: true } },
      },
      orderBy: [{ estado: "asc" }, { abiertoEn: "desc" }],
    }),
    prisma.casoConvivencia.count({ where: whereCasosAccesibles(user) }),
  ]);

  const estudiantes = await prisma.estudiante.findMany({
    where: whereEstudiantesAccesibles(user),
    select: { id: true, nombres: true, apellidos: true },
    orderBy: { apellidos: "asc" },
  });

  // Conserva la búsqueda al cambiar de estado (y viceversa).
  const hrefEstado = (e?: EstadoCaso) => {
    const p = new URLSearchParams();
    if (e) p.set("estado", e);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/convivencia?${s}` : "/convivencia";
  };

  const hayFiltros = Boolean(estadoSel || q);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Convivencia escolar</h1>
          <p className="mt-1 text-sm text-tinta-tenue">
            Casos con registro de entrevistas y seguimientos (Ley 21.809, debido
            proceso). Información reservada.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <NuevoCaso
          estudiantes={estudiantes.map((e) => ({
            id: e.id,
            nombre: `${e.apellidos}, ${e.nombres}`,
          }))}
        />
      </div>

      {/* Filtros: chips por estado + búsqueda por texto */}
      {totalSinFiltro > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
            {[
              { estado: undefined as EstadoCaso | undefined, label: "Todos" },
              { estado: "ABIERTO" as const, label: "Abiertos" },
              { estado: "EN_SEGUIMIENTO" as const, label: "En seguimiento" },
              { estado: "CERRADO" as const, label: "Cerrados" },
            ].map((f) => {
              const activo = estadoSel === f.estado;
              return (
                <Link
                  key={f.label}
                  href={hrefEstado(f.estado)}
                  aria-current={activo ? "true" : undefined}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    activo
                      ? "border-marca-500 bg-marca-50 text-marca-700"
                      : "border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
                  }`}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
          <form className="ml-auto flex items-center gap-1.5" action="/convivencia" method="get">
            {estadoSel && <input type="hidden" name="estado" value={estadoSel} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar caso o estudiante…"
              maxLength={80}
              className="w-48 rounded-lg border border-borde-fuerte bg-superficie px-2.5 py-1.5 text-xs transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
            />
            <button type="submit" className="btn btn-fantasma px-2.5 py-1.5 text-xs">
              Buscar
            </button>
          </form>
        </div>
      )}

      {hayFiltros && (
        <p className="mt-2 text-xs text-tinta-tenue">
          {casos.length} de {totalSinFiltro} {totalSinFiltro === 1 ? "caso" : "casos"}
          {" · "}
          <Link href="/convivencia" className="font-medium text-marca-600 hover:text-marca-700">
            Limpiar filtros
          </Link>
        </p>
      )}

      {casos.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
          {hayFiltros ? "Ningún caso coincide con los filtros." : "No hay casos registrados."}
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {casos.map((c) => {
            const ui = ESTADO_UI[c.estado as EstadoCaso];
            return (
              <li key={c.id}>
                <Link
                  href={`/convivencia/${c.id}`}
                  className="block rounded-xl border border-borde bg-superficie p-4 shadow-suave transition hover:border-borde-fuerte hover:bg-superficie-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-tinta">{c.titulo}</span>
                        <span className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${ui.badge}`}>
                          {ui.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-tinta-tenue">
                        {c.estudiante.apellidos}, {c.estudiante.nombres} · {c.categoria}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-tinta-tenue">
                      {c._count.seguimientos} seguimiento(s)
                      <br />
                      {fmt(c.abiertoEn)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
