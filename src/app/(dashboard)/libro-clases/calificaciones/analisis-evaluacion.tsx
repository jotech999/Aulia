"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { analizarEvaluacionIA } from "./ia-actions";
import type { AnalisisEvaluacion } from "@/lib/ia/evaluacion";

/**
 * ANÁLISIS DE UNA EVALUACIÓN — panel que se abre desde la columna de la prueba
 * en la libreta.
 *
 * Muestra primero las CIFRAS (calculadas por la plataforma, no por la IA) y
 * después la lectura pedagógica y la clase de refuerzo propuesta. Ese orden es
 * deliberado: los números son verificables y la interpretación es un borrador.
 *
 * Se renderiza con portal a `document.body` porque vive dentro de una tabla con
 * `overflow-x-auto`: dentro del contenedor quedaría recortado por el scroll
 * horizontal, que es exactamente el error que ya nos costó el menú móvil.
 */
export function AnalisisEvaluacionIA({
  evaluacionId,
  nombreEvaluacion,
  onCerrar,
}: {
  evaluacionId: string;
  nombreEvaluacion: string;
  onCerrar: () => void;
}) {
  const [analisis, setAnalisis] = useState<AnalisisEvaluacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function generar() {
    setError(null);
    startTransition(async () => {
      const r = await analizarEvaluacionIA(evaluacionId);
      if (r.ok) setAnalisis(r.analisis);
      else setError(r.error);
    });
  }

  function copiarClase() {
    if (!analisis) return;
    const c = analisis.clase;
    const texto = [
      c.titulo,
      "",
      `Objetivo: ${c.objetivo}`,
      "",
      `Inicio (10 min): ${c.inicio}`,
      "",
      `Desarrollo (25 min): ${c.desarrollo}`,
      "",
      `Cierre (10 min): ${c.cierre}`,
      "",
      `Cómo saber si resultó: ${c.comoSaberSiResulto}`,
    ].join("\n");
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      })
      .catch(() => setError("No se pudo copiar al portapapeles."));
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-tinta/40 backdrop-blur-[2px]"
        onClick={onCerrar}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={`Análisis de ${nombreEvaluacion}`}
        className="relative flex max-h-[88vh] w-full max-w-2xl animate-[aparecer_0.2s_ease-out_both] flex-col overflow-hidden rounded-t-2xl border border-borde bg-superficie shadow-flotante sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-borde px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold leading-tight tracking-tight text-tinta">
              Análisis de “{nombreEvaluacion}”
            </h2>
            <p className="mt-0.5 text-xs text-tinta-tenue">
              Qué no se logró y cómo volver a enseñarlo. Orientativo: tú decides.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tinta-tenue hover:bg-superficie-3"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!analisis && !error && (
            <div className="py-6 text-center">
              <p className="text-sm text-tinta-suave">
                Se leerán las notas de esta evaluación, su comparación con el resto de la asignatura
                y —si aplicaste una rúbrica— el logro criterio por criterio.
              </p>
              <p className="mt-2 text-xs text-tinta-tenue">
                No se envía ningún nombre ni nota individual: solo promedios y porcentajes.
              </p>
              <button
                type="button"
                onClick={generar}
                disabled={pendiente}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-acento/40 bg-acento/10 px-4 py-2 text-sm font-semibold text-marca-700 transition-colors hover:bg-acento/20 disabled:opacity-60"
              >
                {pendiente ? "Analizando…" : "✨ Analizar esta evaluación"}
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-peligro/25 bg-peligro-suave px-3 py-2.5 text-sm text-peligro">
              <p>{error}</p>
              <button
                type="button"
                onClick={generar}
                disabled={pendiente}
                className="mt-2 text-xs font-semibold underline disabled:opacity-60"
              >
                Reintentar
              </button>
            </div>
          )}

          {analisis && (
            <div className="space-y-5">
              <Cifras cifras={analisis.cifras} />

              <section>
                <h3 className="text-sm font-semibold text-tinta">Lectura del curso</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-tinta-suave">
                  {analisis.lectura}
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-tinta">Focos de refuerzo</h3>
                <ol className="mt-2 space-y-2.5">
                  {analisis.focos.map((f, i) => (
                    <li key={i} className="rounded-xl border border-borde bg-superficie-2 p-3">
                      <p className="text-sm font-semibold text-tinta">
                        {i + 1}. {f.titulo}
                      </p>
                      {f.evidencia && (
                        <p className="mt-1 text-xs italic leading-relaxed text-tinta-tenue">
                          {f.evidencia}
                        </p>
                      )}
                      <p className="mt-1.5 text-sm leading-relaxed text-tinta-suave">{f.accion}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="rounded-xl border border-marca-200 bg-marca-50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-marca-800">
                    Clase de refuerzo propuesta
                  </h3>
                  <button
                    type="button"
                    onClick={copiarClase}
                    className="rounded-lg border border-marca-300 bg-superficie px-2.5 py-1 text-xs font-semibold text-marca-700 hover:bg-marca-50"
                  >
                    {copiado ? "Copiada ✓" : "Copiar para la planificación"}
                  </button>
                </div>
                <p className="mt-2 font-medium text-tinta">{analisis.clase.titulo}</p>
                <dl className="mt-2 space-y-2 text-sm">
                  <Campo termino="Objetivo" valor={analisis.clase.objetivo} />
                  <Campo termino="Inicio (10 min)" valor={analisis.clase.inicio} />
                  <Campo termino="Desarrollo (25 min)" valor={analisis.clase.desarrollo} />
                  <Campo termino="Cierre (10 min)" valor={analisis.clase.cierre} />
                  <Campo termino="Cómo saber si resultó" valor={analisis.clase.comoSaberSiResulto} />
                </dl>
              </section>

              <p className="text-xs leading-relaxed text-tinta-tenue">
                Generado con IA a partir de datos agregados del curso. Revísalo antes de usarlo: la
                decisión pedagógica es tuya y queda registrada a tu nombre.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Campo({ termino, valor }: { termino: string; valor: string }) {
  if (!valor) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-marca-700">{termino}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap leading-relaxed text-tinta-suave">{valor}</dd>
    </div>
  );
}

/** Los números que sustentan el análisis, calculados por la plataforma. */
function Cifras({ cifras }: { cifras: AnalisisEvaluacion["cifras"] }) {
  const total = cifras.conNota || 1;
  const diferencia =
    cifras.promedio !== null && cifras.promedioAsignatura !== null
      ? cifras.promedio - cifras.promedioAsignatura
      : null;

  return (
    <section className="rounded-xl border border-borde bg-superficie-2 p-3.5">
      <h3 className="text-sm font-semibold text-tinta">Los números</h3>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span>
          <strong className="font-display text-xl tabular-nums text-tinta">
            {cifras.promedio !== null ? cifras.promedio.toFixed(1) : "—"}
          </strong>{" "}
          <span className="text-tinta-tenue">promedio</span>
        </span>
        <span className="text-tinta-suave">
          <strong className="tabular-nums">{cifras.reprobados}</strong> bajo 4.0 (
          {Math.round((cifras.reprobados / total) * 100)}%)
        </span>
        <span className="text-tinta-tenue">{cifras.conNota} con nota</span>
        {cifras.sinNota > 0 && (
          <span className="text-alerta">{cifras.sinNota} sin calificar</span>
        )}
      </div>

      {diferencia !== null && (
        <p className="mt-1.5 text-xs text-tinta-tenue">
          {Math.abs(diferencia) < 0.25
            ? "En línea con el resto de las evaluaciones de la asignatura."
            : `${Math.abs(diferencia).toFixed(1)} puntos ${diferencia < 0 ? "bajo" : "sobre"} el promedio del resto de la asignatura (${cifras.promedioAsignatura!.toFixed(1)}).`}
        </p>
      )}

      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-tenue">
        {cifras.distribucion.map((d) => (
          <li key={d.rango} className="tabular-nums">
            {d.rango}: <strong className="text-tinta-suave">{d.n}</strong>
          </li>
        ))}
      </ul>

      {cifras.criterios.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
            Logro por criterio de la rúbrica
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {cifras.criterios.map((c) => (
              <li key={c.descripcion} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-tinta-suave" title={c.descripcion}>
                  {c.descripcion}
                </span>
                <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-borde">
                  <span
                    className={`block h-full rounded-full ${
                      c.logro < 50 ? "bg-peligro" : c.logro < 70 ? "bg-alerta" : "bg-exito"
                    }`}
                    style={{ width: `${Math.min(c.logro, 100)}%` }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right font-semibold tabular-nums text-tinta">
                  {c.logro}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2.5 text-xs leading-relaxed text-tinta-tenue">
          Esta evaluación no tiene una rúbrica aplicada, así que solo se puede leer la nota final. Si
          la próxima vez la evalúas con rúbrica, el análisis podrá decirte qué criterio falló.
        </p>
      )}
    </section>
  );
}
