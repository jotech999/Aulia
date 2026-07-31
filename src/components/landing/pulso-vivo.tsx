"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "El pulso del colegio, en vivo": panel cinematográfico con gráficas que se
 * dibujan al entrar en pantalla. Todo SVG/CSS autocontenido (sin librerías),
 * con datos ilustrativos. Las animaciones parten cuando la sección es visible
 * (IntersectionObserver) y respetan prefers-reduced-motion.
 */

/** Cuenta desde 0 hasta `hasta` cuando `activo` se enciende. */
function Contador({
  hasta,
  decimales = 0,
  sufijo = "",
  activo,
}: {
  hasta: number;
  decimales?: number;
  sufijo?: string;
  activo: boolean;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!activo) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(hasta);
      return;
    }
    const dur = 1400;
    const t0 = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const p = Math.min((t - t0) / dur, 1);
      // easeOutCubic: entra rápido y aterriza suave, como una cifra "real".
      const e = 1 - Math.pow(1 - p, 3);
      setV(hasta * e);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [activo, hasta]);
  return (
    <span className="tabular-nums">
      {v.toLocaleString("es-CL", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}
      {sufijo}
    </span>
  );
}

/** Línea de asistencia semanal que se dibuja de izquierda a derecha. */
function GraficoLinea({ activo }: { activo: boolean }) {
  // Curva ilustrativa de asistencia (lunes a viernes, 4 semanas).
  const d =
    "M0,64 C20,60 32,52 48,50 C64,48 72,56 88,52 C104,48 112,38 128,36 C144,34 152,40 168,38 C184,36 192,28 208,26 C224,24 232,30 248,26 C264,22 276,16 292,14";
  return (
    <svg viewBox="0 0 292 80" className="h-full w-full" aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id="pv-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c3aef7" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#c3aef7" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pv-linea" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c3aef7" />
          <stop offset="100%" stopColor="#ffb84d" />
        </linearGradient>
      </defs>
      {/* Retícula tenue */}
      {[20, 40, 60].map((y) => (
        <line key={y} x1="0" x2="292" y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {/* Área bajo la curva: aparece después del trazo */}
      <path
        d={`${d} L292,80 L0,80 Z`}
        fill="url(#pv-area)"
        style={{
          opacity: activo ? 1 : 0,
          transition: "opacity 0.9s ease 1s",
        }}
      />
      {/* La línea se dibuja */}
      <path
        d={d}
        fill="none"
        stroke="url(#pv-linea)"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: activo ? 0 : 1,
          transition: "stroke-dashoffset 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.2s",
        }}
      />
      {/* Punto final con pulso */}
      <circle cx="292" cy="14" r="4" fill="#ffb84d" style={{ opacity: activo ? 1 : 0, transition: "opacity 0.4s ease 1.7s" }}>
        <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" begin="1.8s" />
      </circle>
    </svg>
  );
}

/** Anillo radial que se traza hasta el porcentaje objetivo. */
function Anillo({ activo, pct, etiqueta }: { activo: boolean; pct: number; etiqueta: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const objetivo = c * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="52" cy="52" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
          <circle
            cx="52"
            cy="52"
            r={r}
            fill="none"
            stroke="url(#pv-anillo)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={activo ? objetivo : c}
            style={{ transition: "stroke-dashoffset 1.8s cubic-bezier(0.22, 1, 0.36, 1) 0.4s" }}
          />
          <defs>
            <linearGradient id="pv-anillo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c3aef7" />
              <stop offset="100%" stopColor="#ffb84d" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="cifra text-2xl font-bold text-white">
            <Contador hasta={pct} decimales={1} sufijo="%" activo={activo} />
          </span>
        </div>
      </div>
      <p className="mt-2 max-w-[9rem] text-center text-xs leading-snug text-white/60">{etiqueta}</p>
    </div>
  );
}

/** Barras de la semana que crecen escalonadas. */
function BarrasSemana({ activo }: { activo: boolean }) {
  const barras = [82, 88, 91, 86, 94];
  const dias = ["Lu", "Ma", "Mi", "Ju", "Vi"];
  return (
    <div>
      {/* Las barras son hijas directas del contenedor con altura fija: así el
          porcentaje de height tiene base definida y la animación funciona. */}
      <div className="flex h-24 items-end gap-2.5">
        {barras.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-md bg-gradient-to-t from-marca-500 to-marca-300"
            style={{
              height: activo ? `${h}%` : "2%",
              transition: `height 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${0.3 + i * 0.12}s`,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-2.5">
        {dias.map((d) => (
          <span key={d} className="flex-1 text-center text-[10px] font-medium text-white/50">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PulsoVivo() {
  const ref = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setActivo(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="encabezado-cine malla-academica estrellas relative overflow-hidden rounded-3xl p-6 shadow-flotante sm:p-10"
    >
      <span className="aurora-luz aurora-luz-1" aria-hidden />
      <span className="aurora-luz aurora-luz-3" aria-hidden />
      <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Gráfico principal: evolución de la asistencia */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/50">Asistencia del semestre</p>
              <p className="mt-1 font-display text-3xl font-bold text-white">
                <Contador hasta={94.2} decimales={1} sufijo="%" activo={activo} />
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-exito/20 px-2.5 py-1 text-xs font-bold text-[#7fe0b4]">
              ▲ <Contador hasta={2.8} decimales={1} sufijo=" pts" activo={activo} />
            </span>
          </div>
          <div className="mt-4 h-32">
            <GraficoLinea activo={activo} />
          </div>
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">Esta semana</p>
            <BarrasSemana activo={activo} />
          </div>
        </div>

        {/* Columna derecha: anillo + contadores */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <Anillo activo={activo} pct={96.5} etiqueta="Cumplimiento Circular N°30 del semestre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: 812, s: "", d: 0, e: "estudiantes al día" },
              { v: 43, s: "", d: 0, e: "cursos con lista pasada" },
              { v: 12, s: " seg", d: 0, e: "en tomar asistencia" },
              { v: 100, s: "%", d: 0, e: "respaldo a 5 años" },
            ].map((m) => (
              <div key={m.e} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur">
                <p className="cifra text-xl font-bold text-white">
                  <Contador hasta={m.v} decimales={m.d} sufijo={m.s} activo={activo} />
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/55">{m.e}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-acento/60 to-transparent" aria-hidden />
    </div>
  );
}
