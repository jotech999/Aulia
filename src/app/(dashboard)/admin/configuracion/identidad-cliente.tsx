"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarIdentidad } from "./actions";

/**
 * Identidad visual del colegio: logo (URL https) y color de marca que tiñe
 * botones, pestañas activas y acentos de toda la interfaz.
 */

/**
 * Temas curados: paletas armónicas listas para elegir con un clic. `color` es
 * la base (marca-500) desde la que el layout deriva toda la escala con
 * color-mix; `claro` solo pinta el degradado de la muestra. Lila = null
 * porque es el tema de fábrica (sin override).
 */
const TEMAS: { nombre: string; color: string | null; claro: string }[] = [
  { nombre: "Lila Aulia", color: null, claro: "#c3aef7" },
  { nombre: "Azul océano", color: "#3b6fe0", claro: "#93b6f5" },
  { nombre: "Verde bosque", color: "#159570", claro: "#7fd6bc" },
  { nombre: "Burdeo", color: "#c2385f", claro: "#eb9ab1" },
  { nombre: "Grafito", color: "#5b6478", claro: "#aab3c5" },
];
export function IdentidadColegio({
  logoInicial,
  colorInicial,
}: {
  logoInicial: string | null;
  colorInicial: string | null;
}) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(logoInicial ?? "");
  const [color, setColor] = useState(colorInicial ?? "#7442d2");
  const [usaColor, setUsaColor] = useState(Boolean(colorInicial));
  const [estado, setEstado] = useState<"inactivo" | "guardando" | "ok" | "error">("inactivo");
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEstado("guardando");
    setError(null);
    const res = await actualizarIdentidad({
      logoUrl: logoUrl.trim(),
      colorMarca: usaColor ? color : "",
    });
    if (res.ok) {
      setEstado("ok");
      setTimeout(() => setEstado("inactivo"), 2000);
      router.refresh();
    } else {
      setEstado("error");
      setError(res.error ?? "No se pudo guardar.");
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-tinta-suave">
        URL del logo (https, PNG o SVG con fondo transparente)
        <div className="mt-1 flex items-center gap-3">
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://micolegio.cl/logo.png"
            maxLength={500}
            className="w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
          />
          {logoUrl.startsWith("https://") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Vista previa del logo"
              className="h-10 w-10 shrink-0 rounded-lg border border-borde object-contain p-0.5"
            />
          )}
        </div>
      </label>

      {/* Temas de color: paletas curadas que tiñen toda la interfaz del colegio */}
      <div>
        <p className="text-sm font-medium text-tinta-suave">Tema de color del colegio</p>
        <p className="mt-0.5 text-xs text-tinta-tenue">
          Tiñe botones, menú, gráficos y acentos para todos los usuarios del establecimiento.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {TEMAS.map((t) => {
            const activo = t.color === null ? !usaColor : usaColor && color.toLowerCase() === t.color;
            return (
              <button
                key={t.nombre}
                type="button"
                onClick={() => {
                  if (t.color === null) {
                    setUsaColor(false);
                  } else {
                    setUsaColor(true);
                    setColor(t.color);
                  }
                }}
                aria-pressed={activo}
                className={`superficie group relative flex flex-col items-center gap-2 rounded-xl border p-3.5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevada ${
                  activo ? "border-marca-500 shadow-elevada ring-2 ring-marca-200" : "border-borde shadow-suave"
                }`}
              >
                <span
                  className="h-10 w-10 rounded-full shadow-suave transition-transform duration-200 group-hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, ${t.color ?? "#8a5fe4"}, ${t.claro})`,
                  }}
                  aria-hidden
                />
                <span className="text-xs font-semibold text-tinta">{t.nombre}</span>
                {activo && (
                  <span className="absolute right-2 top-2 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-marca-600 text-[9px] font-bold text-white" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Color personalizado (avanzado) */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-tinta-tenue">
            <input
              type="checkbox"
              checked={usaColor && !TEMAS.some((t) => t.color === color.toLowerCase())}
              onChange={(e) => {
                if (e.target.checked) setUsaColor(true);
                else setUsaColor(false);
              }}
              className="accent-marca-500"
            />
            Color personalizado
          </label>
          {usaColor && (
            <>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Color de marca del colegio"
                className="h-8 w-12 cursor-pointer rounded-lg border border-borde-fuerte bg-superficie p-1"
              />
              <code className="rounded bg-superficie-3 px-2 py-1 text-xs text-tinta-suave">{color}</code>
              <span
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                Vista previa
              </span>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={estado === "guardando"}
        className="btn btn-primario"
      >
        {estado === "guardando" ? "Guardando…" : estado === "ok" ? "¡Guardado!" : "Guardar identidad"}
      </button>
      <p className="text-xs text-tinta-tenue">
        El color tiñe botones, pestañas y acentos para todo el colegio. Déjalo desactivado para
        usar el lila estándar de Aulia.
      </p>
    </div>
  );
}
