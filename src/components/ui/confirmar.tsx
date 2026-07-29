"use client";

import { useSyncExternalStore } from "react";

/**
 * Diálogo de confirmación consistente, SOLO para acciones de riesgo real
 * (eliminar, cerrar mes…). Store a nivel de módulo: cualquier client component
 * hace `if (await confirmar({...})) …` sin plumbing de contexto. `<ConfirmHost/>`
 * se monta una vez en el layout. Reemplaza el window.confirm() nativo.
 */

type Pendiente = {
  id: number;
  titulo: string;
  mensaje?: string;
  textoConfirmar: string;
  textoCancelar: string;
  peligro: boolean;
  resolver: (ok: boolean) => void;
};

let contador = 0;
let actual: Pendiente | null = null;
const listeners = new Set<() => void>();
function emitir() {
  listeners.forEach((l) => l());
}

export function confirmar(opts: {
  titulo: string;
  mensaje?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  peligro?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    actual = {
      id: ++contador,
      titulo: opts.titulo,
      mensaje: opts.mensaje,
      textoConfirmar: opts.textoConfirmar ?? "Confirmar",
      textoCancelar: opts.textoCancelar ?? "Cancelar",
      peligro: opts.peligro ?? false,
      resolver: resolve,
    };
    emitir();
  });
}

function cerrar(ok: boolean) {
  const p = actual;
  actual = null;
  emitir();
  p?.resolver(ok);
}

export function ConfirmHost() {
  const p = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => actual,
    () => actual
  );
  if (!p) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-tinta/40 p-4 backdrop-blur-[1px] sm:items-center" role="dialog" aria-modal="true" aria-label={p.titulo}>
      <div
        className="w-full max-w-sm rounded-2xl border border-borde bg-superficie p-5 shadow-flotante"
        onKeyDown={(e) => e.key === "Escape" && cerrar(false)}
      >
        <h2 className="font-display text-lg font-semibold tracking-tight text-tinta">{p.titulo}</h2>
        {p.mensaje && <p className="mt-1.5 text-sm text-tinta-suave">{p.mensaje}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => cerrar(false)}
            className="rounded-xl border border-borde px-4 py-2 text-sm font-semibold text-tinta-suave hover:bg-superficie-2"
          >
            {p.textoCancelar}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => cerrar(true)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${p.peligro ? "bg-peligro hover:brightness-95" : "bg-marca-600 hover:bg-marca-700"}`}
          >
            {p.textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
