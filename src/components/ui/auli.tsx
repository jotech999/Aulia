/**
 * AULI — la mascota de Aulia: una pizarra verde clásica (como las antiguas)
 * con marco de madera, ojos que parpadean, sonrisa de tiza y su tiza en la
 * bandeja. Es el personaje del asistente de IA y de toda la plataforma.
 *
 * Ánimos:
 * - "feliz" (default): sonrisa de tiza — el asistente, saludos.
 * - "curiosa": mira hacia arriba con boquita de "hmm" — estados vacíos.
 * - "sorprendida": ojos grandes y boca abierta — páginas de error.
 *
 * SVG autocontenido; el parpadeo vive en globals.css (.auli-ojo) y respeta
 * prefers-reduced-motion. Decorativa (aria-hidden): el texto accesible lo
 * pone quien la usa.
 */
export type AnimoAuli = "feliz" | "curiosa" | "sorprendida";

export function Auli({
  className = "h-8 w-8",
  animo = "feliz",
}: {
  className?: string;
  animo?: AnimoAuli;
}) {
  // Pupilas: hacia el frente (feliz), hacia arriba pensando (curiosa),
  // al centro y chicas (sorprendida).
  const pupila =
    animo === "curiosa"
      ? { dx: 1.6, dy: -1.8, r: 2.5 }
      : animo === "sorprendida"
        ? { dx: 0, dy: 0, r: 2.2 }
        : { dx: 1.2, dy: 1.1, r: 2.7 };
  const ojoRy = animo === "sorprendida" ? 7 : 6.2;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {/* Marco de madera (ámbar tiza, el acento de la marca) */}
      <rect x="4" y="7" width="56" height="45" rx="9" fill="#e8a34f" />
      <rect x="4" y="7" width="56" height="45" rx="9" fill="url(#auli-madera)" />
      {/* Pizarra verde clásica, como las antiguas */}
      <rect x="9.5" y="12.5" width="45" height="34" rx="5.5" fill="#2f6152" />
      {/* Borrones de tiza mal borrada (le dan lo "antiguo") */}
      <path
        d="M13.5 42.5c6-1.6 12-1.6 17 0"
        stroke="rgba(253,250,242,0.10)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M36 16.5c5-1.2 10-1.2 14.5 0"
        stroke="rgba(253,250,242,0.09)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Brillo superior de la pizarra */}
      <path
        d="M14 17.5c9-2.2 22-2.2 28 0"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Ojos (parpadean) */}
      <g className="auli-ojo">
        <ellipse cx="24" cy="27.5" rx="5.4" ry={ojoRy} fill="#fff" />
        <circle cx={24 + pupila.dx} cy={27.5 + pupila.dy} r={pupila.r} fill="#1c3a31" />
        <circle cx={25 + pupila.dx} cy={26.3 + pupila.dy} r="0.9" fill="#fff" />
      </g>
      <g className="auli-ojo auli-ojo-2">
        <ellipse cx="40" cy="27.5" rx="5.4" ry={ojoRy} fill="#fff" />
        <circle cx={40 + pupila.dx} cy={27.5 + pupila.dy} r={pupila.r} fill="#1c3a31" />
        <circle cx={41 + pupila.dx} cy={26.3 + pupila.dy} r="0.9" fill="#fff" />
      </g>
      {/* Mejillas de tiza */}
      <circle cx="17.5" cy="35" r="2.6" fill="#fdfaf2" opacity="0.35" />
      <circle cx="46.5" cy="35" r="2.6" fill="#fdfaf2" opacity="0.35" />
      {/* Boca de tiza según el ánimo */}
      {animo === "feliz" && (
        <path
          d="M26.5 38.5c3.4 3.1 7.6 3.1 11 0"
          stroke="#fdfaf2"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      )}
      {animo === "curiosa" && (
        <path
          d="M28.5 39.2c2.3 1.8 4.7 1.8 7 0"
          stroke="#fdfaf2"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      )}
      {animo === "sorprendida" && (
        <ellipse cx="32" cy="40" rx="3.4" ry="4" fill="#1c3a31" stroke="#fdfaf2" strokeWidth="1.8" />
      )}
      {/* Bandeja con su tiza blanca */}
      <rect x="9" y="52" width="46" height="5.5" rx="2.75" fill="#c9863c" />
      <g transform="rotate(-7 40 50.9)">
        <rect x="34.5" y="49.2" width="11" height="3.4" rx="1.7" fill="#fdfaf2" />
        <rect x="34.5" y="50.9" width="11" height="1.7" rx="0.85" fill="#e3ddd0" />
      </g>
      <defs>
        <linearGradient id="auli-madera" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(120,60,10,0.18)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
