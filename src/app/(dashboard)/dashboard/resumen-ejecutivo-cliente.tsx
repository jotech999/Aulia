"use client";

import { useState } from "react";
import { generarResumenDireccion } from "./acciones-ia";

/**
 * Isla de cliente en el panel de dirección: genera con IA un borrador de
 * informe ejecutivo del colegio a partir de datos agregados (sin PII).
 */
export function ResumenEjecutivo({ disponible }: { disponible: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState("");
  const [copiado, setCopiado] = useState(false);

  if (!disponible) return null;

  async function generar() {
    if (cargando) return;
    setError(null);
    setCargando(true);
    const res = await generarResumenDireccion();
    setCargando(false);
    if (res.ok) {
      setInforme(res.informe);
      setAbierto(true);
    } else {
      setError(res.error);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(informe);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  }

  return (
    <section className="mt-8">
      <div className="superficie rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-tight">
              Informe ejecutivo con IA
            </h2>
            <p className="mt-0.5 text-xs text-tinta-tenue">
              Panorama del colegio en 1 minuto: asistencia, rendimiento, convivencia y
              recomendaciones. Solo usa datos agregados, sin información individual.
            </p>
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={cargando}
            className="btn btn-primario shrink-0"
          >
            {cargando ? "Analizando el colegio…" : informe ? "Actualizar informe" : "Generar informe"}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
            {error}
          </p>
        )}

        {abierto && informe && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-tinta-tenue">
                Borrador editable — revísalo antes de compartirlo
              </span>
              <button
                type="button"
                onClick={copiar}
                className="text-xs font-medium text-marca-600 hover:text-marca-700"
              >
                {copiado ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
            <textarea
              value={informe}
              onChange={(e) => setInforme(e.target.value)}
              className="min-h-[280px] w-full resize-y rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm leading-relaxed text-tinta focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
            />
          </div>
        )}
      </div>
    </section>
  );
}
