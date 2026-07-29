"use client";

import { useEffect, useId, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/**
 * Detecta la preferencia de movimiento reducido. Cuando el usuario la activa,
 * los gráficos aparecen sin animación (accesibilidad — regla de la skill).
 */
function usePrefiereMenosMovimiento() {
  const [reducir, setReducir] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducir(mq.matches);
    const on = () => setReducir(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reducir;
}

// Curva de entrada coherente con --ease-suave del design system.
const CURVA_ENTRADA = "ease-out" as const;

type TooltipContentProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string }>;
};

/**
 * Gráficos de Aulia sobre nuestros design tokens (colores vía CSS vars).
 * Client-only (recharts). Identidad Pizarra & Ámbar; accesibles y livianos.
 */

const VERDE = "var(--color-marca-500)";
const TINTA_TENUE = "var(--color-tinta-tenue)";
const BORDE = "var(--color-borde)";

/** Tooltip sobrio y coherente con la paleta. */
function TooltipCard({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-xs shadow-elevada">
      {label != null && <p className="font-medium text-tinta">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="tabular-nums text-tinta-suave">
          {p.name ? `${p.name}: ` : ""}
          <span className="font-semibold text-tinta">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Mini gráfico de área para tarjetas (tendencia sin ejes). */
export function Sparkline({
  datos,
  color = VERDE,
  alto = 40,
}: {
  datos: number[];
  color?: string;
  alto?: number;
}) {
  const id = useId().replace(/:/g, "");
  const reducir = usePrefiereMenosMovimiento();
  const data = datos.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={data} margin={{ top: 3, bottom: 3, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#sp-${id})`}
          isAnimationActive={!reducir}
          animationDuration={650}
          animationEasing={CURVA_ENTRADA}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type BarraDato = { label: string; valor: number; color?: string };

/** Histograma / barras verticales con color por barra (p. ej. bandas de notas). */
export function Histograma({
  datos,
  alto = 200,
  etiqueta,
}: {
  datos: BarraDato[];
  alto?: number;
  etiqueta?: string;
}) {
  const reducir = usePrefiereMenosMovimiento();
  return (
    <div role="img" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart data={datos} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={BORDE} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: TINTA_TENUE }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: TINTA_TENUE }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          <Tooltip cursor={{ fill: "var(--color-superficie-3)" }} content={<TooltipCard />} />
          <Bar
            dataKey="valor"
            radius={[4, 4, 0, 0]}
            maxBarSize={56}
            isAnimationActive={!reducir}
            animationDuration={750}
            animationEasing={CURVA_ENTRADA}
          >
            {datos.map((d, i) => (
              <Cell key={i} fill={d.color ?? VERDE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type PuntoLinea = { label: string; valor: number | null };

/** Línea con área para evolución en el tiempo (p. ej. asistencia mensual). */
export function LineaArea({
  datos,
  color = VERDE,
  alto = 220,
  dominio = [0, 100],
  sufijo = "",
  etiqueta,
}: {
  datos: PuntoLinea[];
  color?: string;
  alto?: number;
  dominio?: [number, number];
  sufijo?: string;
  etiqueta?: string;
}) {
  const id = useId().replace(/:/g, "");
  const reducir = usePrefiereMenosMovimiento();
  return (
    <div role="img" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height={alto}>
        <AreaChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`la-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={BORDE} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: TINTA_TENUE }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={dominio}
            tick={{ fontSize: 11, fill: TINTA_TENUE }}
            axisLine={false}
            tickLine={false}
            width={42}
            tickFormatter={(v) => `${v}${sufijo}`}
          />
          <Tooltip content={<TooltipCard />} />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#la-${id})`}
            connectNulls
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={!reducir}
            animationDuration={900}
            animationEasing={CURVA_ENTRADA}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export type FilaProgreso = { label: string; valor: number; detalle?: string };

/** Barras de progreso etiquetadas (p. ej. cobertura por asignatura). CSS liviano.
 *  Crecen desde 0 al montar, con un leve escalonado (cascada), respetando la
 *  preferencia de movimiento reducido. */
export function BarrasProgreso({ filas }: { filas: FilaProgreso[] }) {
  const reducir = usePrefiereMenosMovimiento();
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setMontado(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <ul className="space-y-3">
      {filas.map((f, i) => {
        const objetivo = Math.min(Math.max(f.valor, 0), 100);
        const ancho = reducir || montado ? objetivo : 0;
        return (
          <li key={f.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="truncate pr-2 text-tinta-suave">{f.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-tinta">
                {f.detalle ?? `${Math.round(f.valor)}%`}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-superficie-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-marca-500 to-marca-400"
                style={{
                  width: `${ancho}%`,
                  transition: reducir ? undefined : "width 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
                  transitionDelay: reducir ? undefined : `${Math.min(i * 60, 400)}ms`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
