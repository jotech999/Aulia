/**
 * Avatar de iniciales con color derivado del nombre. Presentacional puro
 * (server-safe). La paleta es curada y armónica con la identidad Pizarra &
 * Ámbar; todos los fondos tienen contraste AA con texto blanco.
 */

const PALETA: string[] = [
  "#235444", // verde marca
  "#2f6d84", // teal
  "#3f5a8a", // índigo pizarra
  "#7a5ea7", // morado apagado
  "#a2453f", // terracota
  "#8a5a2b", // café
  "#4c6b2f", // oliva
  "#b8730a", // ámbar oscuro
];

function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (h * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Iniciales a partir de nombres y apellidos (2 letras). */
function iniciales(nombres: string, apellidos: string): string {
  const n = nombres.trim()[0] ?? "";
  const a = apellidos.trim()[0] ?? "";
  return (n + a).toUpperCase() || "?";
}

const TAMANOS = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-xl",
  xl: "h-20 w-20 text-2xl",
} as const;

export function Avatar({
  nombres,
  apellidos,
  tamano = "md",
  className = "",
}: {
  nombres: string;
  apellidos: string;
  tamano?: keyof typeof TAMANOS;
  className?: string;
}) {
  const color = PALETA[hash(`${apellidos} ${nombres}`) % PALETA.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${TAMANOS[tamano]} ${className}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {iniciales(nombres, apellidos)}
    </span>
  );
}
