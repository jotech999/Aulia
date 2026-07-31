/**
 * AULI — la mascota de Aulia: una pizarrita con marco de madera, ojos que
 * parpadean y sonrisa de tiza. Es el personaje del asistente de IA.
 *
 * SVG autocontenido; el parpadeo vive en globals.css (.auli-ojo) y respeta
 * prefers-reduced-motion. Decorativa (aria-hidden): el texto accesible lo
 * pone quien la usa.
 */
export function Auli({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {/* Marco de madera (ámbar tiza, el acento de la marca) */}
      <rect x="4" y="7" width="56" height="45" rx="9" fill="#e8a34f" />
      <rect x="4" y="7" width="56" height="45" rx="9" fill="url(#auli-madera)" />
      {/* Pizarra (violeta profundo de la marca) */}
      <rect x="9.5" y="12.5" width="45" height="34" rx="5.5" fill="#39306b" />
      {/* Brillo superior de la pizarra */}
      <path
        d="M14 17.5c9-2.2 22-2.2 28 0"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Ojos (parpadean) */}
      <g className="auli-ojo">
        <ellipse cx="24" cy="27.5" rx="5.4" ry="6.2" fill="#fff" />
        <circle cx="25.2" cy="28.6" r="2.7" fill="#241d3d" />
        <circle cx="26.2" cy="27.4" r="0.9" fill="#fff" />
      </g>
      <g className="auli-ojo auli-ojo-2">
        <ellipse cx="40" cy="27.5" rx="5.4" ry="6.2" fill="#fff" />
        <circle cx="41.2" cy="28.6" r="2.7" fill="#241d3d" />
        <circle cx="42.2" cy="27.4" r="0.9" fill="#fff" />
      </g>
      {/* Mejillas de tiza */}
      <circle cx="17.5" cy="35" r="2.6" fill="#ffb84d" opacity="0.35" />
      <circle cx="46.5" cy="35" r="2.6" fill="#ffb84d" opacity="0.35" />
      {/* Sonrisa de tiza */}
      <path
        d="M26.5 38.5c3.4 3.1 7.6 3.1 11 0"
        stroke="#ffedc9"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bandeja con tiza */}
      <rect x="9" y="52" width="46" height="5.5" rx="2.75" fill="#c9863c" />
      <rect x="35" y="49.6" width="9.5" height="3.2" rx="1.6" fill="#fdfaf2" transform="rotate(-7 39.75 51.2)" />
      <defs>
        <linearGradient id="auli-madera" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(120,60,10,0.18)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
