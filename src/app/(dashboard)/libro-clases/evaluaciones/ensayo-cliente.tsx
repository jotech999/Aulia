"use client";

/**
 * GENERADOR DE ENSAYOS SIMCE/PAES (isla de cliente): la profesora elige el
 * tipo y la cantidad, la IA elabora las preguntas al estilo del instrumento
 * real y el ensayo queda como quiz listo para revisar y aplicar.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generarEnsayoAction } from "./ensayo-actions";
import { toast } from "@/components/ui/toast";

export function GeneradorEnsayo({
  asignaturaId,
  disponible,
}: {
  asignaturaId: string;
  disponible: boolean;
}) {
  const [tipo, setTipo] = useState<"SIMCE" | "PAES">("SIMCE");
  const [cantidad, setCantidad] = useState(8);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  if (!disponible) return null;

  function generar() {
    startTransition(async () => {
      const r = await generarEnsayoAction({ asignaturaId, tipoEnsayo: tipo, cantidad });
      if (r.ok) {
        toast.exito(`Ensayo ${tipo} creado con ${r.cantidad} preguntas. Revísalo antes de aplicar.`);
        router.push(`/libro-clases/evaluaciones/${r.quizId}`);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <section className="mt-5">
      <div className="encabezado-cine malla-academica relative overflow-hidden rounded-2xl p-5 shadow-elevada">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-acento">Ensayos con IA</p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white">
              Genera un ensayo SIMCE o PAES en segundos
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/70">
              Preguntas de alternativas al estilo del instrumento real, alineadas al nivel del
              curso. Quedan en el banco y como quiz listo para aplicar — siempre como borrador
              que tú revisas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "SIMCE" | "PAES")}
              aria-label="Tipo de ensayo"
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur [&>option]:text-tinta"
            >
              <option value="SIMCE">SIMCE</option>
              <option value="PAES">PAES</option>
            </select>
            <select
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              aria-label="Cantidad de preguntas"
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur [&>option]:text-tinta"
            >
              {[5, 8, 10, 12, 15].map((n) => (
                <option key={n} value={n}>
                  {n} preguntas
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={generar}
              disabled={pendiente}
              className="boton-brillo rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-marca-700 shadow-suave transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {pendiente ? "Elaborando ítems…" : "Generar ensayo"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
