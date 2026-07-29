"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarEvento } from "./actions";

/** Elimina (soft-delete) un evento del calendario, con confirmación. */
export function BotonEliminarEvento({ id, titulo }: { id: string; titulo: string }) {
  const [pendiente, startTransition] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const router = useRouter();

  function borrar() {
    startTransition(async () => {
      const r = await eliminarEvento(id);
      if (r.ok) router.refresh();
      setConfirmar(false);
    });
  }

  if (confirmar) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs">
        <button
          type="button"
          onClick={borrar}
          disabled={pendiente}
          className="font-medium text-peligro hover:underline"
        >
          {pendiente ? "…" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmar(false)}
          className="text-tinta-tenue hover:underline"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmar(true)}
      aria-label={`Eliminar evento ${titulo}`}
      className="shrink-0 rounded-lg px-2 py-1 text-xs text-tinta-tenue transition-colors hover:bg-superficie-3 hover:text-peligro"
    >
      Eliminar
    </button>
  );
}
