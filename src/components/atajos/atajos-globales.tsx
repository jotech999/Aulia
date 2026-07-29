"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Atajos de teclado globales de una tecla para el staff docente. Se ignoran
 * cuando el foco está en un campo de texto (para no interferir al escribir) o
 * si hay teclas modificadoras. `?` abre el panel de ayuda (evento).
 * Documentados en el panel "?" (boton-ayuda).
 */
const RUTAS: Record<string, string> = {
  a: "/libro-clases/asistencia", // Asistencia
  n: "/libro-clases/calificaciones", // Notas
  l: "/libro-clases/firma", // Leccionario
  h: "/libro-clases/horario", // Horario
  p: "/planificacion", // Planificación
  i: "/dashboard", // Inicio
};

function enCampoDeTexto(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function AtajosGlobales({ habilitarNavegacion = true }: { habilitarNavegacion?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (enCampoDeTexto(e.target)) return;

      // "?" (Shift + /) abre la ayuda con los atajos.
      if (e.key === "?") {
        e.preventDefault();
        window.dispatchEvent(new Event("abrir-ayuda"));
        return;
      }
      if (!habilitarNavegacion || e.shiftKey) return;
      const ruta = RUTAS[e.key.toLowerCase()];
      if (ruta) {
        e.preventDefault();
        router.push(ruta);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, habilitarNavegacion]);

  return null;
}
