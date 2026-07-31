"use client";

/**
 * Crear una evaluación directamente desde el calendario: al tocar un día, la
 * profesora elige la asignatura y agenda la prueba con esa fecha (pedido
 * docente: antes había que ir a la libreta para agendarla).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearEvaluacion } from "../libro-clases/calificaciones/actions";
import { semestreEscolar } from "@/lib/fecha";

export function NuevaEvaluacion({
  asignaturas,
  fechaInicial,
  autoAbrir = false,
}: {
  asignaturas: { id: string; nombre: string }[];
  fechaInicial: string;
  autoAbrir?: boolean;
}) {
  const [abierto, setAbierto] = useState(autoAbrir);
  const [asignaturaId, setAsignaturaId] = useState(asignaturas[0]?.id ?? "");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"SUMATIVA" | "FORMATIVA">("SUMATIVA");
  const [ponderacion, setPonderacion] = useState(30);
  const [fecha, setFecha] = useState(fechaInicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  if (asignaturas.length === 0) return null;

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await crearEvaluacion({
        asignaturaId,
        nombre,
        tipo,
        ponderacion,
        periodo: semestreEscolar(fecha.slice(0, 7)),
        fecha,
      });
      if (r.ok) {
        setNombre("");
        setAbierto(false);
        router.push("/calendario?mes=" + fecha.slice(0, 7));
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn btn-primario text-sm">
        + Evaluación
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-borde bg-superficie p-4 shadow-suave">
      <p className="mb-3 text-sm font-bold text-tinta">Agendar evaluación</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-tinta-tenue">
          Asignatura
          <select
            value={asignaturaId}
            onChange={(e) => setAsignaturaId(e.target.value)}
            className="mt-0.5 block w-52 rounded-lg border border-borde px-2 py-1.5 text-sm"
          >
            {asignaturas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-tinta-tenue">
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Prueba unidad 2"
            className="mt-0.5 block w-44 rounded-lg border border-borde px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-tinta-tenue">
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-tinta-tenue">
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "SUMATIVA" | "FORMATIVA")}
            className="mt-0.5 block w-28 rounded-lg border border-borde px-2 py-1.5 text-sm"
          >
            <option value="SUMATIVA">Sumativa</option>
            <option value="FORMATIVA">Formativa</option>
          </select>
        </label>
        <label className="text-xs font-medium text-tinta-tenue">
          Ponderación
          <input
            type="number"
            min={1}
            step={1}
            value={ponderacion}
            onChange={(e) => setPonderacion(Number(e.target.value))}
            className="mt-0.5 block w-20 rounded-lg border border-borde px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !nombre.trim()}
          className="btn btn-primario"
        >
          {pendiente ? "Agendando…" : "Agendar"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-sm text-tinta-tenue hover:text-tinta"
        >
          Cancelar
        </button>
      </div>
      <p className="mt-2 text-[11px] text-tinta-tenue">
        La evaluación queda en la libreta de la asignatura y los apoderados del curso la
        verán en su calendario.
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}
