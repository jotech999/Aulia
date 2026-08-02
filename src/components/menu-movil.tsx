"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { NavEscritorio } from "./navegacion";
import { Isotipo } from "./ui/isotipo";

/**
 * Menú móvil: botón hamburguesa + cajón deslizante con la navegación agrupada y
 * etiquetada (la misma del escritorio). Reemplaza la tira horizontal de iconos,
 * inusable cuando un rol ve muchos módulos. Se cierra al navegar, con Esc o al
 * tocar fuera.
 *
 * OJO — el cajón se monta con portal en <body> a propósito. Este botón vive
 * dentro de la barra superior, que lleva `backdrop-filter` (.topbar-vidrio), y
 * un elemento con backdrop-filter se vuelve el bloque contenedor de sus
 * descendientes `position: fixed`. Sin el portal, `fixed inset-0` se resolvía
 * contra la barra (≈52px de alto) y el menú se dibujaba aplastado dentro de
 * ella: en el teléfono simplemente no se veía la navegación.
 */
export function MenuMovil({
  rol,
  colegioNombre,
  badges,
}: {
  rol: string;
  colegioNombre?: string | null;
  badges?: Record<string, number>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMontado(true), []);

  // Cierra al cambiar de ruta.
  useEffect(() => setAbierto(false), [pathname]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  // Bloquea el scroll del fondo mientras el cajón está abierto.
  useEffect(() => {
    document.body.style.overflow = abierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        aria-expanded={abierto}
        className="flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border border-borde bg-superficie px-2 text-tinta-suave shadow-suave transition-colors hover:bg-superficie-3"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-5 w-5" aria-hidden>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
        <span className="hidden text-xs font-semibold xs:inline">Menú</span>
      </button>

      {abierto && montado && createPortal(
        <div className="fixed inset-0 z-[80] md:hidden">
          <div
            className="absolute inset-0 bg-tinta/40 backdrop-blur-[1px]"
            onClick={() => setAbierto(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-[aparecer_0.18s_ease-out_both] flex-col overflow-hidden border-r border-borde bg-superficie px-3 py-4 shadow-flotante"
          >
            <div className="mb-4 flex items-center justify-between px-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Isotipo className="h-8 w-8 shrink-0" />
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold leading-tight tracking-tight">Aulia</p>
                  {colegioNombre && (
                    <p className="truncate text-xs text-tinta-tenue">{colegioNombre}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tinta-tenue hover:bg-superficie-3"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-5 w-5" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavEscritorio rol={rol} badges={badges} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
