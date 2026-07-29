"use client";

import { useState, useTransition } from "react";
import { PALETA } from "@/lib/colores-asignatura";
import { actualizarColorAsignatura } from "./actions";

const CLAVES = Object.keys(PALETA);

/**
 * Selector de color de una asignatura: swatches de la paleta + opción "Auto"
 * (convención por nombre). Optimista; ante error revierte y avisa.
 */
export function SelectorColor({
  asignaturaId,
  colorInicial,
  puedeEditar,
}: {
  asignaturaId: string;
  colorInicial: string | null;
  puedeEditar: boolean;
}) {
  const [color, setColor] = useState<string | null>(colorInicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function elegir(nuevo: string | null) {
    if (!puedeEditar || nuevo === color) return;
    const previo = color;
    setColor(nuevo); // optimista
    setError(null);
    startTransition(async () => {
      const r = await actualizarColorAsignatura({ asignaturaId, color: nuevo ?? "" });
      if (!r.ok) {
        setColor(previo);
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5" aria-busy={pendiente}>
      {/* Auto = convención por nombre (sin override) */}
      <button
        type="button"
        onClick={() => elegir(null)}
        disabled={!puedeEditar}
        aria-pressed={color === null}
        title="Automático (por nombre de la asignatura)"
        className={`flex h-6 items-center rounded-full border px-2 text-[11px] font-medium transition-colors ${
          color === null
            ? "border-marca-500 bg-marca-50 text-marca-700"
            : "border-borde text-tinta-tenue hover:bg-superficie-3"
        } ${puedeEditar ? "" : "cursor-default opacity-70"}`}
      >
        Auto
      </button>
      {CLAVES.map((clave) => {
        const activo = color === clave;
        return (
          <button
            key={clave}
            type="button"
            onClick={() => elegir(clave)}
            disabled={!puedeEditar}
            aria-pressed={activo}
            aria-label={PALETA[clave].etiqueta}
            title={PALETA[clave].etiqueta}
            className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-superficie transition-transform hover:scale-110 ${
              PALETA[clave].color.punto
            } ${activo ? "ring-2 ring-tinta" : "ring-1 ring-black/10"} ${
              puedeEditar ? "" : "cursor-default"
            }`}
          />
        );
      })}
      {error && (
        <span role="alert" className="ml-1 text-[11px] text-peligro">
          {error}
        </span>
      )}
    </div>
  );
}
