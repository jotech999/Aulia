"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { marcarNotificacionesLeidas } from "./acciones";

export type ItemNotif = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  leida: boolean;
  fechaISO: string;
};

function tiempoRelativo(iso: string): string {
  const d = new Date(iso).getTime();
  const seg = Math.round((Date.now() - d) / 1000);
  if (seg < 60) return "recién";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 7) return `hace ${dias} d`;
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(new Date(iso));
}

function IconoCampana({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 4a5 5 0 0 0-5 5c0 4-1.5 5.5-2 6.5h14c-.5-1-2-2.5-2-6.5a5 5 0 0 0-5-5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function Campana({
  items,
  noLeidas,
  alinear = "derecha",
}: {
  items: ItemNotif[];
  noLeidas: number;
  /** Hacia dónde se abre el panel: "izquierda" en la barra lateral, "derecha" en el header. */
  alinear?: "izquierda" | "derecha";
}) {
  const [abierta, setAbierta] = useState(false);
  const [contador, setContador] = useState(noLeidas);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierta(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierta(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  function alternar() {
    const nuevo = !abierta;
    setAbierta(nuevo);
    if (nuevo && contador > 0) {
      setContador(0); // optimista
      marcarNotificacionesLeidas().catch(() => {});
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-label={`Notificaciones${contador > 0 ? ` (${contador} sin leer)` : ""}`}
        aria-expanded={abierta}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-tinta-suave transition-colors hover:bg-superficie-3 hover:text-tinta"
      >
        <IconoCampana />
        {contador > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-peligro px-1 text-[10px] font-bold text-white">
            {contador > 9 ? "9+" : contador}
          </span>
        )}
      </button>

      {abierta && (
        <div
          className={`animar-surgir absolute z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-borde bg-superficie shadow-flotante ${
            alinear === "izquierda" ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-borde px-4 py-2.5">
            <p className="text-sm font-semibold text-tinta">Notificaciones</p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-tinta-tenue">
              No tienes notificaciones.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-borde overflow-y-auto">
              {items.map((n) => {
                const contenido = (
                  <div className="flex gap-3 px-4 py-3">
                    {!n.leida && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-marca-500" aria-label="No leída" />
                    )}
                    <div className={`min-w-0 flex-1 ${n.leida ? "pl-5" : ""}`}>
                      <p className="text-sm font-medium text-tinta">{n.titulo}</p>
                      {n.cuerpo && <p className="mt-0.5 text-xs text-tinta-suave">{n.cuerpo}</p>}
                      <p className="mt-1 text-[11px] text-tinta-tenue">{tiempoRelativo(n.fechaISO)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} className="transition-colors hover:bg-superficie-2">
                    {n.enlace ? (
                      <Link href={n.enlace} onClick={() => setAbierta(false)} className="block">
                        {contenido}
                      </Link>
                    ) : (
                      contenido
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
