"use client";

import { useEffect, useState } from "react";

const CLAVE = "aulia:tema";

/**
 * Alternador claro/oscuro. El tema vive en <html data-tema="..."> y se
 * persiste en localStorage; un script inline en el layout raíz lo aplica
 * antes del primer pintado para evitar el destello (FOUC).
 */
export function TemaToggle() {
  const [tema, setTema] = useState<"claro" | "oscuro">("claro");

  useEffect(() => {
    setTema(document.documentElement.dataset.tema === "oscuro" ? "oscuro" : "claro");
  }, []);

  const alternar = () => {
    const nuevo = tema === "oscuro" ? "claro" : "oscuro";
    document.documentElement.dataset.tema = nuevo;
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch {}
    setTema(nuevo);
  };

  const esOscuro = tema === "oscuro";
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={esOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={esOscuro ? "Tema claro" : "Tema oscuro"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-suave transition-colors hover:bg-superficie-3 hover:text-tinta"
    >
      {esOscuro ? (
        // Sol
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // Luna
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
