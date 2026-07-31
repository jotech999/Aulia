import { requerirSesion } from "@/lib/sesion";
import { COOKIE_CONTEXTO } from "@/lib/sesion";
import { signOut } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { NavEscritorio } from "@/components/navegacion";
import { MenuMovil } from "@/components/menu-movil";
import { Asistente } from "@/components/asistente/asistente-cliente";
import { iaDisponible } from "@/lib/ia/cliente";
import { PaletaComandos, BotonPaleta } from "@/components/paleta/paleta-comandos";
import { Campana } from "@/components/notificaciones/campana";
import { contarNoLeidas, listarNotificaciones } from "@/lib/notificaciones";
import { Isotipo } from "@/components/ui/isotipo";
import { ContextoEscolar } from "@/components/contexto-escolar";
import { BotonHoy } from "@/components/mi-dia/boton-hoy";
import { contarMensajesNoLeidos } from "@/lib/mensajes";
import { BotonAyuda } from "@/components/ayuda/boton-ayuda";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirmar";
import { AtajosGlobales } from "@/components/atajos/atajos-globales";
import { SelectorContexto } from "@/components/selector-contexto";
import { BotonCerrarSesion } from "@/components/boton-cerrar-sesion";
import { MigracionClavesLocales } from "@/components/migracion-claves-locales";
import { AccionesTopbar } from "@/components/ui/acciones-topbar";

async function cerrarSesion() {
  "use server";
  const jar = await cookies();
  jar.delete(COOKIE_CONTEXTO);
  await signOut({ redirectTo: "/login" });
}

function iniciales(nombre?: string | null) {
  if (!nombre) return "·";
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const ROL_LEGIBLE: Record<string, string> = {
  ADMIN: "Administrador",
  DIRECTOR: "Director",
  UTP: "UTP",
  PROFESOR_JEFE: "Profesor jefe",
  PROFESOR: "Profesor",
  INSPECTOR: "Inspector",
  APODERADO: "Apoderado",
  PIE: "Equipo PIE",
  SOSTENEDOR: "Sostenedor",
  ESTUDIANTE: "Estudiante",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await requerirSesion();
  const rol = sesion.user.rol ?? "";
  // "Hoy" en el topbar: docentes (su agenda) y dirección/UTP/admin (pulso del colegio).
  const muestraHoy = ["PROFESOR", "PROFESOR_JEFE", "ADMIN", "DIRECTOR", "UTP"].includes(rol);

  const [noLeidas, notifs, mensajesNoLeidos, membresias, colegioIdentidad] = await Promise.all([
    contarNoLeidas(sesion.user.id, sesion.user.colegioId),
    listarNotificaciones(sesion.user.id, sesion.user.colegioId),
    contarMensajesNoLeidos(sesion.user),
    prisma.membresia.findMany({
      where: { usuarioId: sesion.user.id, activa: true },
      select: { id: true, rol: true, colegio: { select: { nombre: true } } },
      orderBy: [{ colegio: { nombre: "asc" } }, { creadaEn: "asc" }],
    }),
    prisma.colegio.findUnique({
      where: { id: sesion.user.colegioId },
      select: { logoUrl: true, colorMarca: true },
    }),
  ]);

  // Identidad del colegio: el color se re-valida como hex ESTRICTO antes de
  // interpolarlo en CSS (nunca se inyecta texto arbitrario en un <style>).
  const logoColegio = colegioIdentidad?.logoUrl?.startsWith("https://")
    ? colegioIdentidad.logoUrl
    : null;
  const colorColegio =
    colegioIdentidad?.colorMarca && /^#[0-9a-f]{6}$/i.test(colegioIdentidad.colorMarca)
      ? colegioIdentidad.colorMarca
      : null;
  const opcionesContexto = membresias.map((m) => ({
    id: m.id,
    rol: m.rol,
    colegioNombre: m.colegio.nombre,
  }));
  const badgesNav = mensajesNoLeidos > 0 ? { "/mensajes": mensajesNoLeidos } : undefined;
  const itemsNotif = notifs.map((n) => ({
    id: n.id,
    tipo: n.tipo,
    titulo: n.titulo,
    cuerpo: n.cuerpo,
    enlace: n.enlace,
    leida: Boolean(n.leidaEn),
    fechaISO: n.creadaEn.toISOString(),
  }));

  return (
    <div className="flex min-h-screen">
      {/* Color de marca del colegio: re-deriva la escala completa con color-mix */}
      {colorColegio && (
        <style>{`:root{
          --color-marca-500:${colorColegio};
          --color-marca-600:color-mix(in srgb, ${colorColegio} 85%, black);
          --color-marca-700:color-mix(in srgb, ${colorColegio} 68%, black);
          --color-marca-800:color-mix(in srgb, ${colorColegio} 52%, black);
          --color-marca-400:color-mix(in srgb, ${colorColegio} 78%, white);
          --color-marca-300:color-mix(in srgb, ${colorColegio} 55%, white);
          --color-marca-200:color-mix(in srgb, ${colorColegio} 35%, white);
          --color-marca-100:color-mix(in srgb, ${colorColegio} 18%, white);
          --color-marca-50:color-mix(in srgb, ${colorColegio} 8%, white);
        }`}</style>
      )}
      {/* Salto al contenido (accesibilidad por teclado) */}
      <a
        href="#contenido"
        className="sr-only left-3 top-3 z-50 rounded-lg bg-marca-600 px-4 py-2 text-sm font-semibold text-white shadow-elevada focus:not-sr-only focus:fixed"
      >
        Saltar al contenido
      </a>
      {/* Barra lateral (escritorio) */}
      <aside data-noprint className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-borde bg-gradient-to-b from-superficie via-superficie to-marca-50/60 px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          {logoColegio ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoColegio}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg object-contain"
            />
          ) : (
            <Isotipo className="h-9 w-9 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold leading-tight tracking-tight">
              Aulia
            </p>
            <p className="truncate text-xs text-tinta-tenue">
              {sesion.user.colegioNombre}
            </p>
          </div>
        </div>

        <NavEscritorio rol={rol} badges={badgesNav} />

        <div className="mt-4 border-t border-borde pt-3">
          <div className="superficie flex items-center gap-2.5 rounded-xl p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-100 text-xs font-semibold text-marca-700">
              {iniciales(sesion.user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{sesion.user.name}</p>
              <p className="truncate text-xs text-tinta-tenue">
                {ROL_LEGIBLE[rol] ?? rol}
              </p>
            </div>
            <form action={cerrarSesion}>
              <BotonCerrarSesion />
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Barra superior (escritorio): buscador global visible + notificaciones */}
        <header data-noprint className="sticky top-0 z-20 hidden items-center gap-4 border-b border-borde bg-superficie/80 px-6 py-2.5 backdrop-blur md:flex">
          <div className="w-full max-w-sm">
            <BotonPaleta />
          </div>
          <AccionesTopbar rol={rol} />
          <div className="ml-auto flex items-center gap-2">
            <SelectorContexto
              actualId={sesion.user.membresiaId}
              opciones={opcionesContexto}
            />
            <ContextoEscolar user={sesion.user} />
            <div className="mx-1 h-5 w-px bg-borde" aria-hidden />
            {muestraHoy && <BotonHoy />}
            <BotonAyuda />
            <Campana items={itemsNotif} noLeidas={noLeidas} />
          </div>
        </header>

        {/* Barra superior (móvil) */}
        <header data-noprint className="sticky top-0 z-10 border-b border-borde bg-superficie/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-1">
              <MenuMovil rol={rol} colegioNombre={sesion.user.colegioNombre} badges={badgesNav} />
              <Isotipo className="h-8 w-8 shrink-0" />
              <p className="font-display font-bold tracking-tight">Aulia</p>
            </div>
            <div className="flex items-center gap-1">
              {muestraHoy && <BotonHoy />}
                <Campana items={itemsNotif} noLeidas={noLeidas} />
              <BotonPaleta compacto />
              <form action={cerrarSesion}>
                <BotonCerrarSesion compacto />
              </form>
            </div>
          </div>
          {opcionesContexto.length > 1 && (
            <div className="border-t border-borde px-3 py-2">
              <SelectorContexto
                actualId={sesion.user.membresiaId}
                opciones={opcionesContexto}
                compacto
              />
            </div>
          )}
        </header>

        <main id="contenido" className="mx-auto max-w-5xl p-4 md:p-8">{children}</main>
      </div>

      <PaletaComandos rol={rol} />

      {iaDisponible() && (
        <Asistente rol={rol} nombre={sesion.user.name} />
      )}

      <Toaster />
      <ConfirmHost />
      <MigracionClavesLocales />
      <AtajosGlobales habilitarNavegacion={["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR"].includes(rol)} />
    </div>
  );
}
