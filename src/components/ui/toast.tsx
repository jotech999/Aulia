"use client";

import { useSyncExternalStore } from "react";

/**
 * Toasts de confirmación consistentes para toda mutación. Store a nivel de
 * módulo: cualquier client component puede llamar `toast.exito(...)` sin
 * plumbing de contexto. `<Toaster/>` se monta una vez en el layout.
 *
 * Regla del producto: nunca guardar en silencio. Éxito → toast (con "deshacer"
 * cuando aplique). Error → toast de error. Reemplaza los `alert()` nativos.
 */

export type AccionToast = { etiqueta: string; onClick: () => void };
export type Toast = {
  id: number;
  tipo: "exito" | "error" | "info" | "advertencia";
  mensaje: string;
  accion?: AccionToast;
};

let contador = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function emitir() {
  toasts = [...toasts];
  listeners.forEach((l) => l());
}

function descartar(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  listeners.forEach((l) => l());
}

function mostrar(tipo: Toast["tipo"], mensaje: string, opts?: { accion?: AccionToast; duracion?: number }) {
  const id = ++contador;
  toasts = [...toasts, { id, tipo, mensaje, accion: opts?.accion }];
  emitir();
  const duracion = opts?.duracion ?? (opts?.accion ? 7000 : 3500);
  if (typeof window !== "undefined") window.setTimeout(() => descartar(id), duracion);
  return id;
}

export const toast = {
  exito: (mensaje: string, opts?: { accion?: AccionToast; duracion?: number }) => mostrar("exito", mensaje, opts),
  error: (mensaje: string, opts?: { duracion?: number }) => mostrar("error", mensaje, opts),
  info: (mensaje: string, opts?: { accion?: AccionToast; duracion?: number }) => mostrar("info", mensaje, opts),
  advertencia: (mensaje: string, opts?: { accion?: AccionToast; duracion?: number }) =>
    mostrar("advertencia", mensaje, opts),
};

const ICONO: Record<Toast["tipo"], string> = {
  exito: "✓",
  error: "!",
  info: "i",
  advertencia: "!",
};
const ESTILO: Record<Toast["tipo"], string> = {
  exito: "border-exito/30 bg-exito-suave text-exito",
  error: "border-peligro/30 bg-peligro-suave text-peligro",
  info: "border-borde bg-superficie text-tinta",
  advertencia: "border-alerta/30 bg-alerta-suave text-alerta",
};

export function Toaster() {
  const lista = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts
  );

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      role="region"
      aria-live="polite"
      aria-label="Notificaciones"
    >
      {lista.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-elevada backdrop-blur ${ESTILO[t.tipo]}`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/60 text-xs font-bold" aria-hidden>
            {ICONO[t.tipo]}
          </span>
          <span className="min-w-0 flex-1">{t.mensaje}</span>
          {t.accion && (
            <button
              type="button"
              onClick={() => {
                t.accion!.onClick();
                descartar(t.id);
              }}
              className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
            >
              {t.accion.etiqueta}
            </button>
          )}
          <button
            type="button"
            onClick={() => descartar(t.id)}
            aria-label="Cerrar"
            className="shrink-0 text-current/60 hover:text-current"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
