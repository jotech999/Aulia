import type { ReactNode } from "react";

/**
 * Insignia de estado coherente. El color nunca es el único canal: se puede
 * activar un punto (`punto`) para que el estado sea legible sin depender del
 * color (accesibilidad). Respaldada por las clases `.insignia*` de globals.css.
 */
type Tono = "neutra" | "marca" | "exito" | "alerta" | "peligro";

const TONO: Record<Tono, string> = {
  neutra: "insignia-neutra",
  marca: "insignia-marca",
  exito: "insignia-exito",
  alerta: "insignia-alerta",
  peligro: "insignia-peligro",
};

export function Insignia({
  tono = "neutra",
  punto = false,
  className,
  children,
}: {
  tono?: Tono;
  punto?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "insignia",
        TONO[tono],
        punto ? "insignia-punto" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
