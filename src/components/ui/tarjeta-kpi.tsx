import Link from "next/link";
import type { ReactNode } from "react";
import { Iconos, type NombreIcono } from "@/components/ui/iconos";

/**
 * Tarjeta de indicador (KPI) coherente para dashboards. Da el "momento héroe":
 * una tarjeta puede marcarse como `destacado` para dominar la jerarquía, y el
 * resto la acompaña sin competir. Soporta tendencia (delta) opcional, un pie
 * libre (p. ej. un sparkline) y navegación. El color del ícono/valor comunica
 * estado, nunca como único canal (se acompaña de texto).
 */
type Tono = "neutro" | "marca" | "alerta" | "peligro";

const TONO_ICONO: Record<Tono, string> = {
  neutro: "icono-gradiente text-white shadow-suave",
  marca: "icono-gradiente text-white shadow-suave",
  alerta: "bg-alerta-suave text-alerta",
  peligro: "bg-peligro-suave text-peligro",
};

export function TarjetaKPI({
  titulo,
  valor,
  contexto,
  icono,
  href,
  tono = "neutro",
  destacado = false,
  valorPeligro = false,
  tendencia,
  pie,
  className,
}: {
  titulo: string;
  valor: ReactNode;
  contexto?: string;
  icono?: NombreIcono;
  href?: string;
  tono?: Tono;
  destacado?: boolean;
  /** Pinta el valor en rojo (p. ej. promedio bajo la aprobación). */
  valorPeligro?: boolean;
  /** Delta de tendencia, p. ej. { direccion: "sube", texto: "+2,1 pts vs. mes anterior" } */
  tendencia?: { direccion: "sube" | "baja" | "estable"; texto: string };
  /** Contenido libre al pie (p. ej. un <Sparkline/>). */
  pie?: ReactNode;
  className?: string;
}) {
  const Icono = icono ? Iconos[icono] : null;
  const base = [
    "superficie superficie-realce flex flex-col rounded-xl transition-all duration-300",
    destacado ? "tarjeta-heroe p-4 sm:p-6" : "p-4 sm:p-5",
    href ? "tarjeta-int hover:-translate-y-0.5" : "hover:-translate-y-0.5 hover:shadow-elevada",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <p className="text-[13px] font-medium leading-snug text-tinta-suave sm:text-sm">{titulo}</p>
        {Icono && (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${TONO_ICONO[tono]}`}
            aria-hidden
          >
            <Icono className="h-[17px] w-[17px] sm:h-[18px] sm:w-[18px]" />
          </span>
        )}
      </div>

      {/* En móvil la cifra baja de tamaño: a pantalla completa cada tarjeta
          ocupaba media pantalla y había que hacer scroll para ver cuatro datos. */}
      <p
        className={`cifra mt-2 sm:mt-3 ${destacado ? "text-[2rem] tracking-tight sm:text-5xl" : "text-2xl sm:text-3xl"} ${
          valorPeligro ? "text-peligro" : destacado ? "texto-degradado" : "text-tinta"
        }`}
      >
        {valor}
      </p>

      {tendencia && (
        <p
          className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
            tendencia.direccion === "sube"
              ? "text-exito"
              : tendencia.direccion === "baja"
                ? "text-peligro"
                : "text-tinta-tenue"
          }`}
        >
          <span aria-hidden>
            {tendencia.direccion === "sube" ? "▲" : tendencia.direccion === "baja" ? "▼" : "→"}
          </span>
          {tendencia.texto}
        </p>
      )}

      {contexto && !tendencia && (
        <p className="mt-1.5 text-xs text-tinta-tenue">{contexto}</p>
      )}

      {pie && <div className="mt-3 -mb-1">{pie}</div>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {cuerpo}
      </Link>
    );
  }
  return <div className={base}>{cuerpo}</div>;
}
