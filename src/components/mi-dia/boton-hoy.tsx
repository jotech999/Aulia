"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { colorAsignatura } from "@/lib/colores-asignatura";
import { ESTILO_EVENTO, type TipoEventoVista } from "@/lib/calendario";
import { agendaHoy, type AgendaHoy, type EstadoClase } from "./acciones";

function IconoHoy({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      <path d="m9 14.5 2 2 4-4" />
    </svg>
  );
}

const ETIQUETA: Record<EstadoClase, { texto: string; clase: string }> = {
  firmada: { texto: "Firmada", clase: "bg-exito-suave text-exito" },
  sin_firmar: { texto: "Sin firmar", clase: "bg-alerta-suave text-alerta" },
  pendiente: { texto: "Pendiente", clase: "bg-superficie-3 text-tinta-tenue" },
};

/** Lista de eventos del calendario de hoy (reuniones, suspensiones, efemérides). */
function EventosHoy({ eventos }: { eventos: { titulo: string; tipo: string }[] }) {
  return (
    <div className="border-t border-borde px-4 py-2.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta-tenue">
        Hoy en el colegio
      </p>
      <ul className="space-y-1.5">
        {eventos.map((e, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${ESTILO_EVENTO[e.tipo as TipoEventoVista].punto}`}
              aria-hidden
            />
            <span className="truncate text-tinta">{e.titulo}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Atajo "Hoy" del topbar: abre un panel con la agenda del día. Para docentes,
 * sus clases con estado de firma + asistencia; para dirección, el pulso del
 * colegio. Ambos ven los eventos de hoy. Los datos se cargan al abrir.
 */
export function BotonHoy() {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<AgendaHoy | null>(null);
  const [cargando, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  function alternar() {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (nuevo && !datos) {
      startTransition(async () => {
        try {
          setDatos(await agendaHoy());
        } catch {
          /* si falla, el panel muestra el estado de carga vacío */
        }
      });
    }
  }

  const pendientes =
    datos?.clases.filter((c) => c.estado !== "firmada").length ?? 0;

  // "Día cerrado" (tipo Lirmi): todas las clases firmadas y —si es profesor
  // jefe— la asistencia del curso tomada. Es el ✓ que pidió la profesora.
  const diaCerrado =
    !!datos &&
    !datos.esGestor &&
    datos.clases.length > 0 &&
    pendientes === 0 &&
    (!datos.asistencia || datos.asistencia.tomada);

  const titulo = datos?.esGestor ? "Hoy en el colegio" : "Mi día";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-label="Agenda de hoy"
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-tinta-suave transition-colors hover:bg-superficie-3 hover:text-tinta"
      >
        <IconoHoy className="h-[18px] w-[18px]" />
        <span className="hidden sm:inline">Hoy</span>
      </button>

      {abierto && (
        <div className="animar-surgir absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-borde bg-superficie shadow-flotante">
          <div className="flex items-center justify-between border-b border-borde px-4 py-2.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-tinta">{titulo}</p>
              {diaCerrado && (
                <span className="inline-flex items-center gap-1 rounded-full bg-exito-suave px-2 py-0.5 text-[11px] font-semibold text-exito">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
                    <path d="M4 10.5l3.5 3.5L16 5.5" />
                  </svg>
                  Día cerrado
                </span>
              )}
            </div>
            {datos && (
              <p className="text-xs capitalize text-tinta-tenue">{datos.fechaLarga}</p>
            )}
          </div>

          {cargando && !datos ? (
            <p className="px-4 py-8 text-center text-sm text-tinta-tenue">Cargando…</p>
          ) : datos?.esGestor ? (
            <div className="max-h-[60vh] overflow-y-auto">
              {/* Pulso del colegio */}
              {datos.resumen && (
                <div className="grid grid-cols-2 gap-px border-b border-borde bg-borde">
                  <div className="bg-superficie px-4 py-3">
                    <p className="font-display text-2xl font-bold tabular-nums leading-none text-tinta">
                      {datos.resumen.clasesFirmadas}
                      <span className="text-base font-medium text-tinta-tenue">/{datos.resumen.clasesProgramadas}</span>
                    </p>
                    <p className="mt-1 text-xs text-tinta-tenue">Clases firmadas hoy</p>
                  </div>
                  <div className="bg-superficie px-4 py-3">
                    <p className="font-display text-2xl font-bold tabular-nums leading-none text-tinta">
                      {datos.resumen.asistenciasHoy}
                    </p>
                    <p className="mt-1 text-xs text-tinta-tenue">Asistencias registradas</p>
                  </div>
                </div>
              )}

              {datos.eventos.length > 0 && <EventosHoy eventos={datos.eventos} />}

              <Link
                href="/calendario"
                onClick={() => setAbierto(false)}
                className="block border-t border-borde px-4 py-2.5 text-center text-xs font-medium text-marca-600 transition-colors hover:bg-superficie-2"
              >
                Ver calendario →
              </Link>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {/* Asistencia de la jefatura */}
              {datos?.asistencia && (
                <Link
                  href="/libro-clases/asistencia"
                  onClick={() => setAbierto(false)}
                  className="flex items-center justify-between border-b border-borde px-4 py-3 transition-colors hover:bg-superficie-2"
                >
                  <span className="text-sm">
                    <span className="font-medium text-tinta">Asistencia {datos.asistencia.curso}</span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      datos.asistencia.tomada
                        ? "bg-exito-suave text-exito"
                        : "bg-alerta-suave text-alerta"
                    }`}
                  >
                    {datos.asistencia.tomada ? "Tomada" : "Pendiente"}
                  </span>
                </Link>
              )}

              {/* Clases de hoy */}
              {datos && datos.clases.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-tinta-tenue">
                  No tienes clases programadas para hoy.
                </p>
              ) : (
                <ul className="divide-y divide-borde">
                  {datos?.clases.map((c, i) => (
                    <li key={`${c.asignaturaId}-${c.hora}-${i}`}>
                      <Link
                        href={`/libro-clases/firma?asignaturaId=${c.asignaturaId}`}
                        onClick={() => setAbierto(false)}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-superficie-2"
                      >
                        <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-tinta-tenue">
                          {c.hora}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${colorAsignatura(c.asignatura, c.color).punto}`}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-tinta">
                              {c.asignatura}
                            </span>
                            <span className="block text-xs text-tinta-tenue">{c.curso}</span>
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ETIQUETA[c.estado].clase}`}>
                          {ETIQUETA[c.estado].texto}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {pendientes > 0 && (
                <p className="px-4 py-2 text-center text-xs text-tinta-tenue">
                  {pendientes} {pendientes === 1 ? "clase pendiente" : "clases pendientes"} de firmar
                </p>
              )}

              {datos && datos.eventos.length > 0 && <EventosHoy eventos={datos.eventos} />}

              <Link
                href="/libro-clases/horario"
                onClick={() => setAbierto(false)}
                className="block border-t border-borde px-4 py-2.5 text-center text-xs font-medium text-marca-600 transition-colors hover:bg-superficie-2"
              >
                Ver mi horario completo →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
