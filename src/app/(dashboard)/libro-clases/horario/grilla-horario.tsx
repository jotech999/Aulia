"use client";

/**
 * GRILLA DEL HORARIO (isla de cliente) — agenda con eje de tiempo real, al
 * estilo de un calendario moderno:
 * - Los bloques se dibujan proporcionales a su duración sobre un eje horario
 *   (una clase de 90 min se VE del doble de alto que una de 45).
 * - Línea de "ahora" cruzando la columna de hoy, moviéndose en vivo (reloj de
 *   Santiago); el bloque en curso pulsa con la insignia "Ahora".
 * - Clic en un bloque → panel de acciones (pasar lista, libreta, leccionario,
 *   evaluaciones) anclado al bloque.
 * - Pestañas Semana | Hoy (agenda vertical del día para el celular).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DIAS_LABORALES, NOMBRE_DIA, type BloqueVista, type FilaHorario } from "@/lib/horario";
import { colorAsignatura } from "@/lib/colores-asignatura";

const aMin = (h: string) => {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
};
const PX_POR_MIN = 1.35; // 45 min ≈ 61 px

/** Hora y día actuales en America/Santiago (independiente del reloj del PC). */
function ahoraSantiago(): { dia: number; min: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const DIA: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    dia: DIA[get("weekday")] ?? 0,
    min: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

type Pop = { b: BloqueVista } | null;

export function GrillaHorario({
  filas,
  mostrarCurso,
  mostrarHorasLibres,
  conAcciones,
}: {
  filas: FilaHorario[];
  mostrarCurso: boolean;
  mostrarHorasLibres: boolean;
  conAcciones: boolean;
}) {
  const [ahora, setAhora] = useState(ahoraSantiago);
  const [pop, setPop] = useState<Pop>(null);
  const [vista, setVista] = useState<"semana" | "hoy">("semana");
  const marcoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraSantiago()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Cerrar el popover con Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPop(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  const hoy = ahora.dia;
  const esDiaLaboral = hoy >= 1 && hoy <= 5;

  const bloques = useMemo(
    () => filas.flatMap((f) => f.celdas.filter((b): b is BloqueVista => b !== null)),
    [filas]
  );

  // Eje de tiempo: desde la hora entera anterior al primer bloque hasta la
  // siguiente al último.
  const { minEje, maxEje, horas } = useMemo(() => {
    if (!bloques.length) return { minEje: 480, maxEje: 960, horas: [] as number[] };
    const min = Math.floor(Math.min(...bloques.map((b) => aMin(b.horaInicio))) / 60) * 60;
    const max = Math.ceil(Math.max(...bloques.map((b) => aMin(b.horaFin))) / 60) * 60;
    const hs: number[] = [];
    for (let h = min; h <= max; h += 60) hs.push(h);
    return { minEje: min, maxEje: max, horas: hs };
  }, [bloques]);
  const altoEje = (maxEje - minEje) * PX_POR_MIN;

  const bloquesHoy = useMemo(
    () =>
      esDiaLaboral
        ? bloques
            .filter((b) => b.dia === hoy)
            .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
        : [],
    [bloques, hoy, esDiaLaboral]
  );

  const estadoBloque = (b: BloqueVista): "pasada" | "ahora" | "proxima" => {
    if (!esDiaLaboral || b.dia !== hoy) return "proxima";
    if (ahora.min >= aMin(b.horaFin)) return "pasada";
    if (ahora.min >= aMin(b.horaInicio)) return "ahora";
    return "proxima";
  };

  const proxima = bloquesHoy.find((b) => aMin(b.horaInicio) > ahora.min);
  const enCurso = bloquesHoy.find((b) => estadoBloque(b) === "ahora");
  const lineaAhoraVisible = esDiaLaboral && ahora.min >= minEje && ahora.min <= maxEje;

  function abrirPop(_e: React.MouseEvent, b: BloqueVista) {
    setPop((p) => (p?.b === b ? null : { b }));
  }

  const fmtHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  return (
    <div>
      {/* Banner: clase en curso o la próxima de hoy */}
      {(enCurso || proxima) && (
        <div
          data-noprint
          className="encabezado-cine mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm text-white shadow-suave"
        >
          {enCurso ? (
            <>
              <span className="relative flex h-2.5 w-2.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acento opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-acento" />
              </span>
              <span className="font-semibold">Ahora: {enCurso.asignatura}</span>
              <span className="text-white/70">
                hasta las {enCurso.horaFin}
                {enCurso.curso ? ` · ${enCurso.curso}` : ""}
              </span>
              {conAcciones && enCurso.cursoId && (
                <Link
                  href={`/libro-clases/asistencia?cursoId=${enCurso.cursoId}`}
                  className="boton-brillo ml-auto rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-marca-700"
                >
                  Pasar lista →
                </Link>
              )}
            </>
          ) : (
            proxima && (
              <>
                <span className="font-semibold">Próxima clase: {proxima.asignatura}</span>
                <span className="text-white/70">
                  a las {proxima.horaInicio}
                  {proxima.curso ? ` · ${proxima.curso}` : ""} · en{" "}
                  {(() => {
                    const d = aMin(proxima.horaInicio) - ahora.min;
                    return d >= 60 ? `${Math.floor(d / 60)} h ${d % 60} min` : `${d} min`;
                  })()}
                </span>
              </>
            )
          )}
        </div>
      )}

      {/* Pestañas Semana | Hoy */}
      <div data-noprint className="mb-3 flex gap-1.5">
        {(
          [
            ["semana", "Semana"],
            ["hoy", `Hoy${bloquesHoy.length ? ` (${bloquesHoy.length})` : ""}`],
          ] as const
        ).map(([id, etiqueta]) => (
          <button
            key={id}
            type="button"
            onClick={() => setVista(id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              vista === id
                ? "bg-marca-600 text-white shadow-suave"
                : "border border-borde text-tinta-suave hover:text-tinta"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {vista === "hoy" ? (
        /* Vista HOY: agenda vertical del día */
        <div data-noprint>
          {bloquesHoy.length === 0 ? (
            <p className="superficie rounded-xl px-5 py-8 text-center text-sm text-tinta-suave">
              {esDiaLaboral ? "Hoy no tienes bloques en este horario." : "Hoy es fin de semana: sin clases."}
            </p>
          ) : (
            <ol className="space-y-2">
              {bloquesHoy.map((b) => {
                const est = estadoBloque(b);
                const c = colorAsignatura(b.asignatura, b.color);
                return (
                  <li
                    key={`${b.horaInicio}-${b.asignaturaId}`}
                    className={`superficie tarjeta-int relative flex items-center gap-3 rounded-xl p-3.5 ${
                      est === "pasada" ? "opacity-55" : ""
                    } ${est === "ahora" ? "ring-2 ring-marca-400" : ""}`}
                  >
                    <span className="w-14 shrink-0 text-center">
                      <span className="block text-sm font-bold tabular-nums text-tinta">{b.horaInicio}</span>
                      <span className="block text-[11px] tabular-nums text-tinta-tenue">{b.horaFin}</span>
                    </span>
                    <span className={`h-9 w-1.5 shrink-0 rounded-full ${c.punto}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-tinta">{b.asignatura}</p>
                      <p className="text-xs text-tinta-tenue">
                        {b.curso ?? ""}
                        {est === "ahora" ? " · en curso" : est === "pasada" ? " · dictada" : ""}
                      </p>
                    </div>
                    {conAcciones && b.cursoId && est !== "pasada" && (
                      <Link
                        href={`/libro-clases/asistencia?cursoId=${b.cursoId}`}
                        className="shrink-0 rounded-lg bg-marca-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-marca-700"
                      >
                        Pasar lista
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : (
        /* Vista SEMANA: agenda con eje de tiempo proporcional */
        <div
          ref={marcoRef}
          className="overflow-x-auto rounded-xl border border-borde bg-superficie p-3 shadow-suave sm:p-4"
        >
          <div className="min-w-[680px]">
            {/* Encabezado de días */}
            <div className="grid" style={{ gridTemplateColumns: "3.5rem repeat(5, 1fr)" }}>
              <div />
              {DIAS_LABORALES.map((dia) => (
                <div
                  key={dia}
                  className={`mx-0.5 mb-2 rounded-lg py-1.5 text-center text-xs font-semibold uppercase tracking-wide ${
                    dia === hoy
                      ? "bg-gradient-to-r from-marca-600 to-marca-500 text-white shadow-suave"
                      : "text-tinta-tenue"
                  }`}
                >
                  {NOMBRE_DIA[dia]}
                  {dia === hoy && <span className="ml-1 font-normal opacity-80">· hoy</span>}
                </div>
              ))}
            </div>

            {/* Cuerpo: eje horario + 5 columnas */}
            <div
              className="relative grid"
              style={{ gridTemplateColumns: "3.5rem repeat(5, 1fr)", height: `${altoEje}px` }}
            >
              {/* Regla de horas + líneas guía */}
              <div className="relative">
                {horas.map((h) => (
                  <span
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-tinta-tenue"
                    style={{ top: `${(h - minEje) * PX_POR_MIN}px` }}
                  >
                    {fmtHora(h)}
                  </span>
                ))}
              </div>
              {horas.map((h) => (
                <span
                  key={`l-${h}`}
                  aria-hidden
                  className="pointer-events-none absolute left-[3.5rem] right-0 border-t border-borde/70"
                  style={{ top: `${(h - minEje) * PX_POR_MIN}px` }}
                />
              ))}

              {/* Columnas por día */}
              {DIAS_LABORALES.map((dia) => {
                const esHoy = dia === hoy;
                const delDia = bloques.filter((b) => b.dia === dia);
                return (
                  <div
                    key={dia}
                    className={`relative mx-0.5 rounded-lg ${esHoy ? "bg-marca-50/70" : ""}`}
                  >
                    {delDia.map((b) => {
                      const est = estadoBloque(b);
                      const c = colorAsignatura(b.asignatura, b.color);
                      const top = (aMin(b.horaInicio) - minEje) * PX_POR_MIN;
                      const alto = (aMin(b.horaFin) - aMin(b.horaInicio)) * PX_POR_MIN;
                      const compacto = alto < 52;
                      return (
                        <button
                          key={`${b.horaInicio}-${b.asignaturaId}`}
                          type="button"
                          onClick={(e) => abrirPop(e, b)}
                          title={`${b.asignatura} · ${b.horaInicio}–${b.horaFin} — clic para acciones`}
                          className={`absolute inset-x-1 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs leading-tight shadow-suave transition-all duration-150 hover:z-10 hover:-translate-y-0.5 hover:shadow-elevada hover:ring-2 hover:ring-marca-300 active:scale-[0.985] ${c.suave} ${
                            est === "pasada" ? "opacity-55" : ""
                          } ${est === "ahora" ? "z-10 ring-2 ring-marca-500 shadow-elevada" : ""}`}
                          style={{ top: `${top + 1}px`, height: `${Math.max(alto - 3, 22)}px`, borderLeftColor: "currentColor" }}
                        >
                          <span className="flex items-center gap-1 font-semibold">
                            <span className="truncate">{b.asignatura}</span>
                            {est === "ahora" && (
                              <span className="shrink-0 rounded bg-marca-600 px-1 py-px text-[9px] font-bold uppercase text-white">
                                Ahora
                              </span>
                            )}
                          </span>
                          {!compacto && (
                            <span className="mt-0.5 block tabular-nums opacity-75">
                              {b.horaInicio}–{b.horaFin}
                              {mostrarCurso && b.curso ? ` · ${b.curso}` : ""}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {mostrarHorasLibres && delDia.length === 0 && (
                      <span className="absolute inset-x-1 top-2 rounded-lg border border-dashed border-borde px-2 py-2 text-center text-[11px] font-medium text-tinta-tenue">
                        Día libre
                      </span>
                    )}

                    {/* Popover de acciones: anclado al bloque dentro de su
                        columna (viaja con el scroll; sin transform animado
                        que lo descentre). */}
                    {pop && pop.b.dia === dia && (() => {
                      const bTop = (aMin(pop.b.horaInicio) - minEje) * PX_POR_MIN;
                      const bBot = (aMin(pop.b.horaFin) - minEje) * PX_POR_MIN;
                      const ALTO_POP = conAcciones ? 236 : 72;
                      const cabeAbajo = bBot + 6 + ALTO_POP <= altoEje;
                      const top = cabeAbajo ? bBot + 6 : Math.max(bTop - ALTO_POP - 6, 0);
                      const lado = dia <= 2 ? "left-0" : dia >= 4 ? "right-0" : "left-1/2 -translate-x-1/2";
                      return (
                        <div
                          role="dialog"
                          aria-label={`Acciones de ${pop.b.asignatura}`}
                          className={`absolute z-40 w-56 rounded-xl border border-borde bg-superficie p-3 shadow-flotante ${lado}`}
                          style={{ top: `${top}px` }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-8 w-1.5 shrink-0 rounded-full ${colorAsignatura(pop.b.asignatura, pop.b.color).punto}`}
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-tinta">{pop.b.asignatura}</p>
                              <p className="text-xs tabular-nums text-tinta-tenue">
                                {pop.b.horaInicio}–{pop.b.horaFin}
                                {pop.b.curso ? ` · ${pop.b.curso}` : ""}
                              </p>
                            </div>
                          </div>
                          {conAcciones && (
                            <div className="mt-2.5 space-y-1">
                              {pop.b.cursoId && (
                                <AccionBloque href={`/libro-clases/asistencia?cursoId=${pop.b.cursoId}`} etiqueta="Pasar lista" />
                              )}
                              <AccionBloque href={`/libro-clases/calificaciones?asignaturaId=${pop.b.asignaturaId}`} etiqueta="Libreta de notas" />
                              <AccionBloque href={`/libro-clases/firma?asignaturaId=${pop.b.asignaturaId}`} etiqueta="Firmar leccionario" />
                              <AccionBloque href={`/libro-clases/evaluaciones?asignaturaId=${pop.b.asignaturaId}`} etiqueta="Evaluaciones" />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}

              {/* Línea de AHORA cruzando la columna de hoy */}
              {lineaAhoraVisible && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-[3.5rem] right-0 z-20"
                  style={{ top: `${(ahora.min - minEje) * PX_POR_MIN}px` }}
                >
                  <div className="relative border-t-2 border-acento/90">
                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-acento shadow-suave" />
                    <span className="absolute right-1 -top-[9px] rounded bg-acento px-1 py-px text-[9px] font-bold tabular-nums text-marca-900">
                      {fmtHora(ahora.min)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Telón transparente: clic fuera cierra el popover */}
      {pop && (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => setPop(null)}
          className="fixed inset-0 z-30 cursor-default"
          tabIndex={-1}
        />
      )}
    </div>
  );
}

function AccionBloque({ href, etiqueta }: { href: string; etiqueta: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-borde px-2.5 py-1.5 text-xs font-medium text-tinta-suave transition-colors hover:border-marca-400 hover:bg-marca-50 hover:text-marca-700"
    >
      {etiqueta}
      <span aria-hidden>→</span>
    </Link>
  );
}
