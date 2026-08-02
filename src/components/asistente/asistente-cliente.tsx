"use client";

import { useEffect, useRef, useState } from "react";
import { Auli } from "@/components/ui/auli";

type Mensaje = { rol: "user" | "assistant"; texto: string };

const SUGERENCIAS: Record<string, string[]> = {
  PROFESOR: [
    "¿Qué clases tengo hoy y cuál viene ahora?",
    "Resume la asistencia de mi curso",
    "¿Qué estudiantes tienen inasistencia crítica?",
    "Ayúdame a redactar un comunicado para apoderados",
  ],
  PROFESOR_JEFE: [
    "¿Qué clases tengo hoy y qué me falta?",
    "¿Qué estudiantes de mi jefatura están en riesgo?",
    "Resume la asistencia de mi curso",
    "Busca a un estudiante por su apellido",
  ],
  ADMIN: [
    "¿Qué cursos tienen más alertas de riesgo?",
    "Resume la asistencia de un curso",
    "Busca a un estudiante",
  ],
  DIRECTOR: [
    "¿Qué cursos requieren atención?",
    "Resumen de asistencia por curso",
    "Estudiantes en riesgo de un curso",
  ],
  UTP: [
    "Alertas de riesgo de un curso",
    "Resumen de asistencia de un curso",
    "Busca a un estudiante",
  ],
  INSPECTOR: [
    "Busca a un estudiante por su nombre",
    "Resume la asistencia de un curso",
    "Lista los cursos disponibles",
  ],
  APODERADO: [
    "¿Cuándo es la próxima prueba de mi pupilo?",
    "¿Qué comunicados no he leído?",
    "¿Cómo va la asistencia de mi pupilo?",
    "¿Mi pupilo tiene alguna alerta?",
    "¿En qué curso está mi pupilo?",
  ],
};

export function Asistente({
  rol,
  nombre,
}: {
  rol: string;
  nombre?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(false);
  // Pregunta pendiente que llega desde otras partes de la interfaz (insights).
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sugerencias = SUGERENCIAS[rol] ?? SUGERENCIAS.PROFESOR;

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto]);

  // Apertura global: cualquier parte de la interfaz puede abrir a Auli con una
  // pregunta lista (ej. las tarjetas del Radar Aulia del panel).
  useEffect(() => {
    function onAbrir(e: Event) {
      const pregunta = (e as CustomEvent<{ pregunta?: string }>).detail?.pregunta;
      setAbierto(true);
      if (pregunta) setPendiente(pregunta);
    }
    window.addEventListener("aulia:abrir-auli", onAbrir);
    return () => window.removeEventListener("aulia:abrir-auli", onAbrir);
  }, []);

  useEffect(() => {
    if (abierto && pendiente && !cargando) {
      const pregunta = pendiente;
      setPendiente(null);
      void enviar(pregunta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pendiente, cargando]);

  async function enviar(texto: string) {
    const limpio = texto.trim();
    if (!limpio || cargando) return;
    setError(null);
    const nuevos: Mensaje[] = [...mensajes, { rol: "user", texto: limpio }];
    setMensajes(nuevos);
    setEntrada("");
    setCargando(true);
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: nuevos.slice(-20) }),
      });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => ({}));
        throw new Error(cuerpo.error ?? "No se pudo obtener respuesta.");
      }
      const data = await res.json();
      setMensajes((m) => [...m, { rol: "assistant", texto: data.respuesta }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      {/* Lanzador flotante */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Abrir a Auli, el asistente de Aulia"
        aria-expanded={abierto}
        className="encabezado-cine fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full py-2.5 pl-2.5 pr-4 text-sm font-semibold text-white shadow-flotante transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-marca-300 md:bottom-5 md:right-5"
      >
        <Auli className="h-9 w-9 drop-shadow-sm" />
        <span className="hidden sm:inline">Auli</span>
      </button>

      {/* Panel */}
      {abierto && (
        <>
          <div
            className="fixed inset-0 z-40 bg-tinta/20 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-0"
            onClick={() => setAbierto(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Auli, el asistente de Aulia"
            className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] animate-[aparecer_0.2s_ease-out_both] flex-col rounded-t-2xl border border-borde bg-superficie pb-[env(safe-area-inset-bottom)] shadow-flotante md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[420px] md:rounded-none md:rounded-l-2xl md:pb-0"
          >
            {/* Encabezado */}
            <header className="encabezado-cine flex items-center justify-between rounded-t-2xl px-5 py-4 md:rounded-none md:rounded-tl-2xl">
              <div className="flex items-center gap-2.5">
                <Auli className="h-10 w-10 drop-shadow-sm" />
                <div>
                  <p className="font-display text-sm font-bold text-white">Auli</p>
                  <p className="text-xs text-white/70">Tu pizarra asistente · consulta y borradores</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            {/* Mensajes */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {mensajes.length === 0 && (
                <div>
                  <p className="text-sm text-tinta-suave">
                    ¡Hola{nombre ? `, ${nombre.split(" ")[0]}` : ""}! Soy Auli. Puedo ayudarte a
                    consultar asistencia, alertas y estudiantes, redactar borradores o guiarte
                    por la plataforma.
                  </p>
                  <div className="mt-4 space-y-2">
                    {sugerencias.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => enviar(s)}
                        className="block w-full rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-left text-sm text-tinta-suave transition-colors hover:border-borde-fuerte hover:text-tinta"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensajes.map((m, i) => (
                <div key={i} className={m.rol === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.rol === "user"
                        ? "bg-marca-600 text-white"
                        : "border border-borde bg-superficie-2 text-tinta"
                    }`}
                  >
                    {m.texto}
                  </div>
                </div>
              ))}

              {cargando && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-xl border border-borde bg-superficie-2 px-3.5 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tinta-tenue [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tinta-tenue [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tinta-tenue" />
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
                  {error}
                </p>
              )}
              <div ref={finRef} />
            </div>

            {/* Entrada + disclaimer */}
            <div className="border-t border-borde px-4 py-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviar(entrada);
                }}
                className="flex items-end gap-2"
              >
                <input
                  ref={inputRef}
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  placeholder="Escribe tu consulta…"
                  maxLength={2000}
                  className="min-w-0 flex-1 rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
                />
                <button
                  type="submit"
                  disabled={cargando || !entrada.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-600 text-white transition-colors hover:bg-marca-700 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
              <p className="mt-2 text-[11px] leading-snug text-tinta-tenue">
                Respuestas generadas por IA: pueden contener errores. Verifica en el libro de
                clases antes de decidir. El asistente no registra datos; solo consulta y redacta borradores.
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
