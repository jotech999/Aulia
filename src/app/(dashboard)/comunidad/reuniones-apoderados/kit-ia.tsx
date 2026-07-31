"use client";

import { useState, useTransition } from "react";
import { generarKit } from "./ia-kit-actions";

/**
 * KIT DE REUNIÓN (isla de cliente): genera la minuta de la reunión con los
 * datos reales agregados del curso. Borrador editable y copiable.
 */
export function KitReunion({ cursoId, disponible }: { cursoId: string; disponible: boolean }) {
  const [minuta, setMinuta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  if (!disponible) return null;

  function generar() {
    setError(null);
    startTransition(async () => {
      const r = await generarKit(cursoId);
      if (r.ok) setMinuta(r.minuta);
      else setError(r.error);
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(minuta);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  }

  return (
    <section className="mb-6">
      <div className="encabezado-cine malla-academica relative overflow-hidden rounded-2xl p-5 shadow-elevada">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-acento">Kit de reunión</p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white">
              La minuta de tu reunión, con los datos reales del curso
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/70">
              Asistencia, rendimiento, próximas evaluaciones y acuerdos anteriores, ordenados
              en una pauta lista para proyectar o imprimir. Solo datos agregados, nunca
              estudiantes individuales.
            </p>
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={pendiente}
            className="boton-brillo shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-marca-700 shadow-suave transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {pendiente ? "Preparando minuta…" : minuta ? "Volver a generar" : "Generar minuta"}
          </button>
        </div>

        {error && (
          <p role="alert" className="relative z-10 mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white">
            {error}
          </p>
        )}

        {minuta && (
          <div className="relative z-10 mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-white/60">Borrador editable — complétalo en la reunión</span>
              <button type="button" onClick={copiar} className="text-xs font-semibold text-acento hover:text-white">
                {copiado ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
            <textarea
              value={minuta}
              onChange={(e) => setMinuta(e.target.value)}
              className="min-h-[300px] w-full resize-y rounded-xl border border-white/15 bg-white/95 px-4 py-3 text-sm leading-relaxed text-tinta focus:outline-none focus:ring-2 focus:ring-acento/50"
            />
          </div>
        )}
      </div>
    </section>
  );
}
