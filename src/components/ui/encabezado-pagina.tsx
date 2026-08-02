import Link from "next/link";
import { Iconos, type NombreIcono } from "@/components/ui/iconos";

/**
 * Encabezado de página estándar: ícono guía opcional + título (display) +
 * descripción, con volante opcional ("volver") y zona de acciones. Da ritmo,
 * jerarquía e identidad coherentes en todas las pantallas.
 */
export function EncabezadoPagina({
  titulo,
  descripcion,
  volver,
  acciones,
  icono,
}: {
  titulo: string;
  descripcion?: string;
  volver?: { href: string; etiqueta: string };
  acciones?: React.ReactNode;
  icono?: NombreIcono;
}) {
  const Icono = icono ? Iconos[icono] : null;
  return (
    <div className="mb-5 sm:mb-6">
      {volver && (
        <Link
          href={volver.href}
          className="inline-flex items-center gap-1 text-xs font-medium text-tinta-tenue transition-colors hover:text-tinta-suave"
        >
          <span aria-hidden>←</span> {volver.etiqueta}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className={`flex items-start gap-3 ${volver ? "mt-1.5" : ""}`}>
          {Icono && (
            <span
              className="icono-gradiente flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-suave sm:h-11 sm:w-11"
              aria-hidden
            >
              <Icono className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
            </span>
          )}
          <div>
            <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-tinta sm:text-[1.7rem]">
              {titulo}
            </h1>
            <span
              className="mt-1.5 block h-1 w-9 rounded-full bg-gradient-to-r from-marca-500 to-acento sm:w-10"
              aria-hidden
            />
            {descripcion && (
              <p className="mt-2 max-w-2xl text-sm text-tinta-suave">{descripcion}</p>
            )}
          </div>
        </div>
        {acciones && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{acciones}</div>}
      </div>
    </div>
  );
}
