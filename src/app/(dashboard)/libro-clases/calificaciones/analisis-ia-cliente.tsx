"use client";

import { useState, useTransition } from "react";
import { analizarAsignaturaIA } from "./ia-actions";

/**
 * Análisis pedagógico del curso en la asignatura, generado con IA a partir de las
 * notas reales. Diagnóstico + acciones de remediación; editable/copiable.
 */
export function AnalisisCursoIA({ asignaturaId }: { asignaturaId: string }) {
  const [analisis, setAnalisis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function generar() {
    setError(null);
    startTransition(async () => {
      const r = await analizarAsignaturaIA(asignaturaId);
      if (r.ok) setAnalisis(r.analisis);
      else setError(r.error);
    });
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Análisis del curso con IA</h2>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            Diagnóstico pedagógico y remediales a partir de las notas del curso. Orientativo; tú decides.
          </p>
        </div>
        <button
          type="button"
          onClick={generar}
          disabled={pendiente}
          className="inline-flex items-center gap-1 rounded-full border border-acento/40 bg-acento/10 px-3 py-1.5 text-sm font-semibold text-marca-700 transition-colors hover:bg-acento/20 disabled:opacity-60"
        >
          {pendiente ? "Analizando…" : analisis ? "✨ Volver a analizar" : "✨ Analizar con IA"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-peligro">{error}</p>}

      {analisis && (
        <div className="mt-3 rounded-xl border border-borde bg-superficie p-4 text-sm leading-relaxed text-tinta shadow-suave">
          <p className="whitespace-pre-wrap">{analisis}</p>
          <p className="mt-3 border-t border-borde pt-3 text-xs text-tinta-tenue">
            Análisis de IA — no reemplaza tu criterio profesional.
          </p>
        </div>
      )}
    </section>
  );
}
