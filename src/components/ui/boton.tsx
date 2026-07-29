import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * Botón coherente para toda la plataforma. La acción principal usa la firma
 * verde de la marca; el resto de variantes mantienen jerarquía clara sin
 * competir por la atención. Respaldado por las clases `.btn*` de globals.css.
 */
type Variante = "primario" | "secundario" | "fantasma" | "peligro";
type Tamano = "sm" | "md" | "lg";

const VARIANTE: Record<Variante, string> = {
  primario: "btn-primario",
  secundario: "btn-secundario",
  fantasma: "btn-fantasma",
  peligro: "btn-peligro",
};
const TAMANO: Record<Tamano, string> = { sm: "btn-sm", md: "", lg: "btn-lg" };

function clases(variante: Variante, tamano: Tamano, extra?: string) {
  return ["btn", VARIANTE[variante], TAMANO[tamano], extra]
    .filter(Boolean)
    .join(" ");
}

export function Boton({
  variante = "primario",
  tamano = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variante?: Variante; tamano?: Tamano }) {
  return <button className={clases(variante, tamano, className)} {...props} />;
}

/** Misma apariencia que Boton, pero navega (usa Link de Next). */
export function BotonEnlace({
  variante = "primario",
  tamano = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; tamano?: Tamano }) {
  return <Link className={clases(variante, tamano, className)} {...props} />;
}
