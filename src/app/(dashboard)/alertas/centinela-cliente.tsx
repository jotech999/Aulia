"use client";

import { useState } from "react";
import { generarCentinela } from "./ia-actions";

/**
 * AGENTE CENTINELA (isla de cliente): la dirección pide el barrido y el agente
 * recorre los cursos por sí mismo (alertas, asistencia, pendientes) y entrega
 * un informe con intervenciones sugeridas. Borrador editable.
 */
export function Centinela({ disponible }: { disponible: boolean }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState("");
  const [copiado, setCopiado] = useState(false);

  if (!disponible) return null;

  async function generar() {
    if (cargando) return;
    setError(null);
    setCargando(true);
    const res = await generarCentinela();
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
    <section className="mb-6">
      <div className="encabezado-cine malla-academica relative overflow-hidden rounded-2xl p-5 shadow-elevada sm:p-6">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-acento">Agente centinela</p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white">
              Barrido completo del colegio con IA
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/70">
              El agente recorre curso por curso, cruza asistencia, notas y pendientes, y te
              entrega a quién intervenir esta semana y cómo. Tarda ~1 minuto.
            </p>
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={cargando}
            className="boton-brillo shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-marca-700 shadow-suave transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {cargando ? "Recorriendo el colegio…" : informe ? "Actualizar barrido" : "Iniciar barrido"}
          </button>
        </div>

        {error && (
          <p role="alert" className="relative z-10 mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white">
            {error}
          </p>
        )}

        {informe && (
          <div className="relative z-10 mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-white/60">
                Borrador editable — revísalo antes de compartirlo
              </span>
              <button type="button" onClick={copiar} className="text-xs font-semibold text-acento hover:text-white">
                {copiado ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
            <textarea
              value={informe}
              onChange={(e) => setInforme(e.target.value)}
              className="min-h-[320px] w-full resize-y rounded-xl border border-white/15 bg-white/95 px-4 py-3 text-sm leading-relaxed text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
            />
          </div>
        )}
      </div>
    </section>
  );
}
