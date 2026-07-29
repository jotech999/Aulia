import type { CSSProperties } from "react";

/**
 * Primitivas de visualización ligeras (SVG/CSS, sin dependencias) siguiendo la
 * skill de dataviz: marcas finas, separación de 2px entre segmentos, leyenda
 * siempre etiquetada (identidad nunca solo por color) y colores de estado
 * reservados. Server-safe (presentacional puro).
 */

export type Segmento = {
  label: string;
  valor: number;
  /** Clase de relleno, p. ej. "bg-emerald-500". */
  clase: string;
};

/**
 * Barra de composición horizontal (magnitud relativa de varios estados).
 * Cada segmento se separa por un hueco de 2px que deja ver la superficie.
 */
export function BarraDistribucion({
  segmentos,
  etiquetaAccesible,
}: {
  segmentos: Segmento[];
  etiquetaAccesible?: string;
}) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0);
  const denom = total || 1;
  const pct = (v: number) => Math.round((v / denom) * 100);

  return (
    <div>
      <div
        className="barra-entra flex h-3 gap-0.5 overflow-hidden rounded-full bg-superficie-3"
        role="img"
        aria-label={
          etiquetaAccesible ??
          segmentos.map((s) => `${s.label}: ${s.valor}`).join(", ")
        }
      >
        {segmentos
          .filter((s) => s.valor > 0)
          .map((s) => (
            <div
              key={s.label}
              className={s.clase}
              style={{ width: `${(s.valor / denom) * 100}%` }}
              title={`${s.label}: ${s.valor} (${pct(s.valor)}%)`}
            />
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {segmentos.map((s) => (
          <li key={s.label} className="inline-flex items-center gap-1.5 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${s.clase}`} aria-hidden />
            <span className="text-tinta-suave">{s.label}</span>
            <span className="font-semibold tabular-nums text-tinta">{s.valor}</span>
            <span className="text-xs tabular-nums text-tinta-tenue">{pct(s.valor)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Medidor radial (donut) para un único porcentaje con umbral semántico.
 * El color no comunica solo: el valor y la etiqueta van en texto.
 */
export function Medidor({
  valor,
  etiqueta,
  umbral = 85,
}: {
  valor: number | null;
  etiqueta: string;
  umbral?: number;
}) {
  const v = valor ?? 0;
  const r = 42;
  const circ = 2 * Math.PI * r;
  const avance = circ * (Math.min(Math.max(v, 0), 100) / 100);
  const color =
    valor === null
      ? "var(--color-tinta-tenue)"
      : v >= umbral
        ? "var(--color-exito-vivo)"
        : v >= umbral - 10
          ? "var(--color-alerta-vivo)"
          : "var(--color-peligro-vivo)";

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative h-28 w-28"
        role="img"
        aria-label={`${etiqueta}: ${valor === null ? "sin datos" : `${valor.toFixed(1)}%`}`}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-superficie-3)" strokeWidth="9" />
          {valor !== null && (
            <circle
              className="anillo-dibujar"
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ - avance}
              style={{ ["--anillo-circ" as string]: circ } as CSSProperties}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold tabular-nums text-tinta">
            {valor === null ? "—" : `${Math.round(valor)}%`}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-tinta-suave">{etiqueta}</p>
    </div>
  );
}
