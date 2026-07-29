"use client";

import { useState, useTransition } from "react";
import { actualizarAvisoApoderados } from "./actions";

type AccionToggle = (input: {
  habilitada: boolean;
}) => Promise<{ ok: boolean; error?: string }>;

export function ToggleAviso({ inicial }: { inicial: boolean }) {
  return <ToggleConfig inicial={inicial} accion={actualizarAvisoApoderados} />;
}

/** Interruptor genérico de un ajuste booleano del colegio (optimista + reversión). */
export function ToggleConfig({
  inicial,
  accion,
}: {
  inicial: boolean;
  accion: AccionToggle;
}) {
  const [activo, setActivo] = useState(inicial);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function alternar() {
    const nuevo = !activo;
    setActivo(nuevo); // optimista
    setError(null);
    startTransition(async () => {
      const res = await accion({ habilitada: nuevo });
      if (!res.ok) {
        setActivo(!nuevo); // revertir
        setError(res.error ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        onClick={alternar}
        disabled={pendiente}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${
          activo ? "bg-marca-600" : "bg-superficie-3"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-suave transition-transform ${
            activo ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}
