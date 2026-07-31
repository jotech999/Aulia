"use client";

import { useState } from "react";
import { generarSimulacro } from "./ia-actions";

/**
 * AGENTE DE FISCALIZACIÓN (isla de cliente): revisa las brechas reales del
 * libro (firmas, listas, evaluaciones sin notas) y entrega un plan de cierre
 * como si la Superintendencia llegara mañana. Borrador editable.
 */
export function SimulacroFiscalizacion({ disponible }: { disponible: boolean }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState("");
  const [copiado, setCopiado] = useState(false);

  if (!disponible) return null;

  async function generar() {
    if (cargando) return;
    setError(null);
    setCargando(true);
    const res = await generarSimulacro();
    setCargando(false);
    if (res.ok) setInforme(res.informe);
    else setError(res.error);
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
      <div className="superficie tarjeta-lumen rounded-2xl border border-borde p-5 shadow-suave sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-marca-600">Agente de fiscalización</p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-tinta">
              Simulacro: ¿y si la Superintendencia llega mañana?
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-tinta-suave">
              El agente revisa firmas pendientes, listas sin pasar y evaluaciones vencidas sin
              notas, y redacta el plan de cierre de brechas priorizado en 7 días.
            </p>
          </div>
          <button type="button" onClick={generar} disabled={cargando} className="btn btn-primario shrink-0">
            {cargando ? "Revisando brechas…" : informe ? "Repetir simulacro" : "Iniciar simulacro"}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
            {error}
          </p>
        )}

        {informe && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-tinta-tenue">
                Borrador editable — el semáforo es orientador, no una certificación
              </span>
              <button type="button" onClick={copiar} className="text-xs font-medium text-marca-600 hover:text-marca-700">
                {copiado ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
            <textarea
              value={informe}
              onChange={(e) => setInforme(e.target.value)}
              className="min-h-[300px] w-full resize-y rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm leading-relaxed text-tinta focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
            />
          </div>
        )}
      </div>
    </section>
  );
}
