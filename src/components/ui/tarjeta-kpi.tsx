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
  neutro: "bg-marca-50 text-marca-600",
  marca: "bg-marca-50 text-marca-600",
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
    "superficie superficie-realce flex flex-col rounded-xl",
    destacado ? "acento-superior p-5 sm:p-6" : "p-5",
    href ? "tarjeta-int" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-tinta-suave">{titulo}</p>
        {Icono && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONO_ICONO[tono]}`}
            aria-hidden
          >
            <Icono className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>

      <p
        className={`cifra mt-3 ${destacado ? "text-[2.6rem] sm:text-5xl" : "text-3xl"} ${
          valorPeligro ? "text-peligro" : "text-tinta"
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
