"use client";

import { useEffect, useState } from "react";
import { Isotipo } from "@/components/ui/isotipo";

/**
 * SPLASH DE ENTRADA — un instante de marca al entrar al panel: el isotipo
 * de Aulia aparece con un pulso de luz y se desvanece hacia el contenido.
 *
 * Se muestra UNA vez por sesión de navegador (sessionStorage) para que no
 * moleste al navegar. Con prefers-reduced-motion no se muestra.
 */
export function SplashEntrada() {
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("aulia-splash")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      sessionStorage.setItem("aulia-splash", "1");
      setVisible(true);
      const salida = setTimeout(() => setSaliendo(true), 1150);
      const fin = setTimeout(() => setVisible(false), 1650);
      return () => {
        clearTimeout(salida);
        clearTimeout(fin);
      };
    } catch {
      /* sessionStorage no disponible: sin splash */
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`encabezado-cine malla-academica estrellas fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-500 ${
        saliendo ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <span className="aurora-luz aurora-luz-1" aria-hidden />
      <span className="aurora-luz aurora-luz-2" aria-hidden />
      <div className="splash-marca relative z-10 flex flex-col items-center">
        <span className="halo-splash">
          <Isotipo tono="claro" className="h-20 w-20 drop-shadow-lg" />
        </span>
        <p className="mt-4 font-display text-3xl font-bold tracking-tight text-white">Aulia</p>
        <p className="mt-1 text-sm text-white/60">Tu colegio, en orden</p>
      </div>
    </div>
  );
}
