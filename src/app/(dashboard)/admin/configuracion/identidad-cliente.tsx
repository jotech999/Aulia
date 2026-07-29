"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarIdentidad } from "./actions";

/**
 * Identidad visual del colegio: logo (URL https) y color de marca que tiñe
 * botones, pestañas activas y acentos de toda la interfaz.
 */
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

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-tinta-suave">
          <input
            type="checkbox"
            checked={usaColor}
            onChange={(e) => setUsaColor(e.target.checked)}
            className="accent-marca-500"
          />
          Usar color propio del colegio
        </label>
        {usaColor && (
          <>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Color de marca del colegio"
              className="h-9 w-14 cursor-pointer rounded-lg border border-borde-fuerte bg-superficie p-1"
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
