"use client";

import { useState, useTransition } from "react";
import { generarInformeIA } from "./ia-actions";

/**
 * Genera con IA un informe de retroalimentación del estudiante a partir de sus
 * datos reales (promedios, asistencia, anotaciones). Borrador editable/copiable;
 * no se guarda ni envía automáticamente.
 */
export function InformeIA({ estudianteId }: { estudianteId: string }) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function generar() {
    setError(null);
    setCopiado(false);
    startTransition(async () => {
      const r = await generarInformeIA(estudianteId);
      if (r.ok) setBorrador(r.borrador);
      else setError(r.error);
    });
  }

  async function copiar() {
    if (!borrador) return;
    try {
      await navigator.clipboard.writeText(borrador);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: el texto ya es seleccionable */
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Retroalimentación con IA</h2>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            Borrador de informe al hogar a partir de promedios, asistencia y anotaciones. Revísalo y edítalo antes de usar.
          </p>
        </div>
        <button
          type="button"
          onClick={generar}
          disabled={pendiente}
          className="inline-flex items-center gap-1 rounded-full border border-acento/40 bg-acento/10 px-3 py-1.5 text-sm font-semibold text-marca-700 transition-colors hover:bg-acento/20 disabled:opacity-60"
        >
          {pendiente ? "Generando…" : borrador ? "✨ Regenerar" : "✨ Generar informe"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-peligro">{error}</p>}

      {borrador && (
        <div className="mt-3 rounded-xl border border-borde bg-superficie p-4 shadow-suave">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-tinta">{borrador}</p>
          <div className="mt-3 flex items-center gap-3 border-t border-borde pt-3">
            <button type="button" onClick={copiar} className="btn btn-secundario btn-sm">
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <span className="text-xs text-tinta-tenue">Borrador de IA — no se guarda ni envía solo.</span>
          </div>
        </div>
      )}
    </section>
  );
}
