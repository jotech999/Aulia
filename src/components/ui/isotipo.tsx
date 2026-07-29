/**
 * Isotipo de Aulia: la "a" de aula trazada de un solo gesto, como escrita a
 * mano. Es la misma marca del favicon (public/icono.svg) como componente
 * reutilizable. Presentacional puro (server-safe), escala con `className`.
 *
 * Por qué una "a" manuscrita y no una A geométrica: el acto que sostiene todo
 * el producto es firmar la clase (Circular N°30), y en una categoría llena de
 * iconos geométricos un trazo de origen manuscrito es lo más difícil de imitar.
 *
 * - `tono="color"` (por defecto): cuadrado lila con la "a" en blanco. Fondos claros.
 * - `tono="claro"`: cuadrado translúcido con borde — para ir sobre el héroe lila
 *   o fondos oscuros, donde el lleno sólido se perdería.
 * - `tono="lineal"`: solo el trazo, en `currentColor` y sin caja. Para firmas de
 *   documento, encabezados impresos y cualquier lugar donde una caja estorbe.
 */
export function Isotipo({
  tono = "color",
  className = "h-9 w-9",
}: {
  tono?: "color" | "claro" | "lineal";
  className?: string;
}) {
  const trazo = tono === "lineal" ? "currentColor" : "#ffffff";
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Inicio">
      {tono === "color" && (
        <defs>
          <linearGradient id="iso-marca" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a5fe4" />
            <stop offset="1" stopColor="#5d33ac" />
          </linearGradient>
        </defs>
      )}
      {tono !== "lineal" && (
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          rx="17"
          fill={tono === "claro" ? "rgba(255,255,255,0.14)" : "url(#iso-marca)"}
          stroke={tono === "claro" ? "rgba(255,255,255,0.28)" : "none"}
          strokeWidth={tono === "claro" ? 1.6 : 0}
        />
      )}
      {/* Bola de la "a": un solo trazo, de derecha a izquierda y de vuelta */}
      <path
        d="M44 25.5C34 18.5 18.5 23.5 17.5 36 16.5 47.5 32 52.5 40.5 45"
        fill="none"
        stroke={trazo}
        strokeWidth="6.3"
        strokeLinecap="round"
      />
      {/* Asta con el remate de salida de la pluma */}
      <path
        d="M44 25.5C42.8 34 42.8 41.5 44.3 46 45.2 48.8 46.8 49.8 48.5 49.3"
        fill="none"
        stroke={trazo}
        strokeWidth="6.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
