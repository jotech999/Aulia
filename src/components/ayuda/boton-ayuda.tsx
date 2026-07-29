"use client";

import { useEffect, useRef, useState } from "react";

/** Atajos de teclado disponibles en la plataforma. */
const ATAJOS: { teclas: string; accion: string }[] = [
  { teclas: "⌘K / Ctrl K", accion: "Buscar acción o estudiante" },
  { teclas: "?", accion: "Abrir esta ayuda" },
  { teclas: "A", accion: "Ir a Asistencia" },
  { teclas: "N", accion: "Ir a Notas (calificaciones)" },
  { teclas: "L", accion: "Ir al Leccionario" },
  { teclas: "H", accion: "Ir al Horario" },
  { teclas: "P", accion: "Ir a Planificación" },
  { teclas: "I", accion: "Ir al Inicio" },
  { teclas: "Esc", accion: "Cerrar diálogos y menús" },
  { teclas: "⌘↵ / Ctrl ↵", accion: "Enviar un mensaje" },
];

/** Novedades recientes (para que las familias/profesores vean lo agregado). */
const NOVEDADES: string[] = [
  "Leccionario con “clases de hoy” y ✓ día cerrado",
  "Horario visual semanal con colores por asignatura",
  "Calendario escolar (reuniones, evaluaciones, efemérides)",
  "Mensajes directos con el apoderado / profesor jefe",
  "Justificar inasistencias desde el portal del apoderado",
  "Buscar estudiantes en ⌘K (incluso con tildes)",
  "Imprimir horario, leccionario y ficha del estudiante",
];

function IconoAyuda({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** Botón "?" del topbar: atajos de teclado + novedades. */
export function BotonAyuda() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    function onAbrir() {
      setAbierto(true);
    }
    document.addEventListener("mousedown", onClickFuera);
    window.addEventListener("keydown", onEsc);
    window.addEventListener("abrir-ayuda", onAbrir);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      window.removeEventListener("keydown", onEsc);
      window.removeEventListener("abrir-ayuda", onAbrir);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Ayuda y atajos"
        aria-expanded={abierto}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-suave transition-colors hover:bg-superficie-3 hover:text-tinta"
      >
        <IconoAyuda />
      </button>

      {abierto && (
        <div className="animar-surgir absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-borde bg-superficie shadow-flotante">
          <div className="max-h-[70vh] overflow-y-auto">
            <section className="border-b border-borde p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-tenue">
                Atajos de teclado
              </p>
              <ul className="space-y-1.5">
                {ATAJOS.map((a) => (
                  <li key={a.teclas} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-tinta-suave">{a.accion}</span>
                    <kbd className="shrink-0 rounded border border-borde bg-superficie-2 px-1.5 py-0.5 text-[11px] font-semibold text-tinta-tenue">
                      {a.teclas}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>

            <section className="p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-tenue">
                Novedades
              </p>
              <ul className="space-y-1.5">
                {NOVEDADES.map((n) => (
                  <li key={n} className="flex items-start gap-2 text-sm text-tinta-suave">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-acento" aria-hidden />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
