// Íconos de línea (stroke) coherentes para la navegación y estados.
// Un solo estilo: grosor 1.75, esquinas redondeadas, viewBox 24. Livianos,
// sin dependencias, tamaño y color heredados vía className / currentColor.

type Props = { className?: string };

function Svg({ className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const Iconos = {
  panel: (p: Props) => (
    <Svg {...p}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-5h5v5" />
    </Svg>
  ),
  alertas: (p: Props) => (
    <Svg {...p}>
      <path d="M12 4a5 5 0 0 0-5 5c0 4-1.5 5.5-2 6.5h14c-.5-1-2-2.5-2-6.5a5 5 0 0 0-5-5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Svg>
  ),
  libro: (p: Props) => (
    <Svg {...p}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 0 5 21.5Z" />
      <path d="M5 18.5A1.5 1.5 0 0 1 6.5 17H19" />
    </Svg>
  ),
  asistencia: (p: Props) => (
    <Svg {...p}>
      <path d="M8 6h11M8 12h11M8 18h11" />
      <path d="m3 5.5 1.2 1.2L6.5 4" />
      <path d="M3.5 12h1M3.5 18h1" />
    </Svg>
  ),
  calificaciones: (p: Props) => (
    <Svg {...p}>
      <path d="M9 4 7 20M17 4l-2 16" />
      <path d="M4 9h16M3 15h16" />
    </Svg>
  ),
  firma: (p: Props) => (
    <Svg {...p}>
      <path d="M3 19c3 0 3-11 6-11 2 0 1 7 3 7 1.5 0 2-3 4-3" />
      <path d="M4 19h16" />
    </Svg>
  ),
  planificacion: (p: Props) => (
    <Svg {...p}>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
    </Svg>
  ),
  cobertura: (p: Props) => (
    <Svg {...p}>
      <path d="M5 4v15a1 1 0 0 0 1 1h14" />
      <path d="M8 15v2M12 11v6M16 7v10" />
    </Svg>
  ),
  comunicacion: (p: Props) => (
    <Svg {...p}>
      <path d="M4 5h16v10H9l-4 3.5V15H4Z" />
      <path d="M8 9h8M8 12h5" />
    </Svg>
  ),
  convivencia: (p: Props) => (
    <Svg {...p}>
      <circle cx="8.5" cy="8" r="2.5" />
      <circle cx="16" cy="9" r="2.2" />
      <path d="M4 19c0-2.8 2-4.5 4.5-4.5S13 16.2 13 19" />
      <path d="M14.5 14.6c2.2.2 4 1.9 4 4.4" />
    </Svg>
  ),
  cursos: (p: Props) => (
    <Svg {...p}>
      <path d="M4 20V9l8-4 8 4v11" />
      <path d="M4 20h16M9 20v-5h6v5" />
      <path d="M12 9.5h.01" />
    </Svg>
  ),
  estudiantes: (p: Props) => (
    <Svg {...p}>
      <path d="m12 4 9 4-9 4-9-4 9-4Z" />
      <path d="M7 10v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4" />
      <path d="M21 8v4.5" />
    </Svg>
  ),
  candado: (p: Props) => (
    <Svg {...p}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2" />
    </Svg>
  ),
  escudo: (p: Props) => (
    <Svg {...p}>
      <path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 9-4.1-1.5-7-4.8-7-9V6l7-3Z" />
      <path d="m9.2 11.8 1.9 1.9 3.7-3.9" />
    </Svg>
  ),
  ajustes: (p: Props) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1l2.1-2.1M17 7l2.1-2.1" />
    </Svg>
  ),
} as const;

export type NombreIcono = keyof typeof Iconos;
