"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { vincularRubricaEvaluacion } from "../actions";
import { Boton } from "@/components/ui/boton";
import { toast } from "@/components/ui/toast";

type Evaluacion = { id: string; etiqueta: string };

export function VincularEvaluacion({
  rubricaId,
  evaluaciones,
}: {
  rubricaId: string;
  evaluaciones: Evaluacion[];
}) {
  const router = useRouter();
  const [evaluacionId, setEvaluacionId] = useState(evaluaciones[0]?.id ?? "");
  const [ocupado, setOcupado] = useState(false);

  async function vincular() {
    if (!evaluacionId) return;
    setOcupado(true);
    const resultado = await vincularRubricaEvaluacion({ rubricaId, evaluacionId });
    setOcupado(false);
    if (!resultado.ok) return toast.error(resultado.error);
    toast.exito("Rúbrica asociada a la evaluación.");
    router.push(`/libro-clases/rubricas/${rubricaId}/aplicar/${evaluacionId}`);
  }

  if (evaluaciones.length === 0) {
    return (
      <p className="rounded-lg bg-superficie-2 px-4 py-3 text-sm text-tinta-suave">
        No hay evaluaciones disponibles sin instrumento en este contexto.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="evaluacion-rubrica">Evaluación</label>
      <select
        id="evaluacion-rubrica"
        value={evaluacionId}
        onChange={(event) => setEvaluacionId(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-200"
      >
        {evaluaciones.map((evaluacion) => (
          <option key={evaluacion.id} value={evaluacion.id}>{evaluacion.etiqueta}</option>
        ))}
      </select>
      <Boton type="button" onClick={vincular} disabled={ocupado || !evaluacionId}>
        {ocupado ? "Asociando…" : "Asociar y aplicar"}
      </Boton>
    </div>
  );
}
