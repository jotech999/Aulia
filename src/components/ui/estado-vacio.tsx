import Link from "next/link";
import type { NombreIcono } from "@/components/ui/iconos";
import { Iconos } from "@/components/ui/iconos";

type Accion = { href: string; etiqueta: string };

/**
 * Estado vacío coherente para toda la plataforma. La skill permite mayor
 * expresión visual aquí, pero SIEMPRE debe indicar la acción siguiente.
 */
export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono?: NombreIcono;
  titulo: string;
  descripcion?: string;
  accion?: Accion;
}) {
  const Icono = icono ? Iconos[icono] : null;
  return (
    <div className="relative mt-6 flex flex-col items-center overflow-hidden rounded-xl border border-dashed border-borde-fuerte bg-superficie px-6 py-14 text-center">
      {/* Iluminación tenue de fondo (decorativa) */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(46,107,84,0.06),transparent_70%)]"
        aria-hidden
      />
      {Icono && (
        <span
          className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca-50 text-marca-500 ring-8 ring-marca-50/40"
          aria-hidden
        >
          <Icono className="h-7 w-7" />
        </span>
      )}
      <p className="font-display text-lg font-semibold text-tinta">{titulo}</p>
      {descripcion && (
        <p className="mt-1 max-w-sm text-sm text-tinta-suave">{descripcion}</p>
      )}
      {accion && (
        <Link
          href={accion.href}
          className="mt-5 inline-flex items-center rounded-lg bg-marca-600 px-4 py-2 text-sm font-semibold text-white shadow-suave transition-colors hover:bg-marca-700"
        >
          {accion.etiqueta}
        </Link>
      )}
    </div>
  );
}
