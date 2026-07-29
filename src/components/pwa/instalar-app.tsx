"use client";

import { useEffect, useState } from "react";

/**
 * Invitación a instalar Aulia como app en el teléfono (PWA).
 * - Android/Chrome: usa el evento nativo `beforeinstallprompt`.
 * - iOS/Safari: muestra la instrucción manual (Compartir → Agregar a inicio).
 * - No aparece si ya está instalada (display-mode: standalone) ni si la
 *   persona la descartó antes (recordado en localStorage).
 */

type EventoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const CLAVE_DESCARTE = "aulia-instalar-descartado";

export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [esIos, setEsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Ya instalada o descartada antes: no molestar.
    const instalada =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    let descartada = false;
    try {
      descartada = localStorage.getItem(CLAVE_DESCARTE) === "1";
    } catch {
      /* almacenamiento no disponible */
    }
    if (instalada || descartada) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) {
      setEsIos(true);
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacion);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const eleccion = await evento.userChoice;
    if (eleccion.outcome === "accepted") setVisible(false);
  }

  function descartar() {
    setVisible(false);
    try {
      localStorage.setItem(CLAVE_DESCARTE, "1");
    } catch {
      /* almacenamiento no disponible */
    }
  }

  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-marca-200 bg-marca-50 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-500 text-lg text-white" aria-hidden>
        📲
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-tinta">Lleva Aulia en tu teléfono</p>
        <p className="text-xs text-tinta-suave">
          {esIos
            ? "En Safari: toca Compartir y luego “Agregar a pantalla de inicio”."
            : "Instálala como app: notas, asistencia y avisos a un toque."}
        </p>
      </div>
      {!esIos && evento && (
        <button type="button" onClick={instalar} className="btn btn-primario shrink-0 px-3 py-1.5 text-xs">
          Instalar
        </button>
      )}
      <button
        type="button"
        onClick={descartar}
        aria-label="No mostrar de nuevo"
        className="shrink-0 text-tinta-tenue transition-colors hover:text-tinta"
      >
        ✕
      </button>
    </div>
  );
}
