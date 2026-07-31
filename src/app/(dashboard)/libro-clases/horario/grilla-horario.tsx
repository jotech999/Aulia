"use client";

/**
 * GRILLA DEL HORARIO (isla de cliente) — la semana viva:
 * - Reloj en Santiago: el bloque EN CURSO pulsa y lleva la insignia "Ahora";
 *   los de hoy ya dictados se atenúan.
 * - "Tu próxima clase": banner con cuenta regresiva del siguiente bloque de hoy.
 * - Clic en un bloque → panel de acciones: pasar lista, libreta, leccionario,
 *   evaluaciones (en vez de un único enlace escondido).
 * - Pestañas Semana | Hoy: agenda del día para el celular.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DIAS_LABORALES, NOMBRE_DIA, type BloqueVista, type FilaHorario } from "@/lib/horario";
import { colorAsignatura } from "@/lib/colores-asignatura";

const aMin = (h: string) => {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
};

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
    min: Number(get("hour")) % 24 * 60 + Number(get("minute")),
  };
}

type Sel = { dia: number; horaInicio: string } | null;

export function GrillaHorario({
  filas,
  mostrarCurso,
  mostrarHorasLibres,
  conAcciones,
}: {
  filas: FilaHorario[];
  mostrarCurso: boolean;
  mostrarHorasLibres: boolean;
  /** Acciones docentes en el popover (lista/libreta/leccionario). */
  conAcciones: boolean;
}) {
  const [ahora, setAhora] = useState(ahoraSantiago);
  const [sel, setSel] = useState<Sel>(null);
  const [vista, setVista] = useState<"semana" | "hoy">("semana");

  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraSantiago()), 30_000);
    return () => clearInterval(t);
  }, []);

  const hoy = ahora.dia;
  const esDiaLaboral = hoy >= 1 && hoy <= 5;

  const bloquesHoy = useMemo(
    () =>
      esDiaLaboral
        ? filas
            .map((f) => f.celdas[hoy - 1])
            .filter((b): b is BloqueVista => b !== null)
            .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
        : [],
    [filas, hoy, esDiaLaboral]
  );

  const estadoBloque = (b: BloqueVista): "pasada" | "ahora" | "proxima" => {
    if (ahora.min >= aMin(b.horaFin)) return "pasada";
    if (ahora.min >= aMin(b.horaInicio)) return "ahora";
    return "proxima";
  };

  const proxima = bloquesHoy.find((b) => estadoBloque(b) === "proxima");
  const enCurso = bloquesHoy.find((b) => estadoBloque(b) === "ahora");

  const Popover = ({ b }: { b: BloqueVista }) => (
    <div className="absolute left-1/2 top-full z-30 mt-1.5 w-56 -translate-x-1/2 rounded-xl border border-borde bg-superficie p-3 text-left shadow-flotante">
      <p className="text-sm font-bold text-tinta">{b.asignatura}</p>
      <p className="mt-0.5 text-xs text-tinta-tenue">
        {b.horaInicio}–{b.horaFin}
        {b.curso ? ` · ${b.curso}` : ""}
      </p>
      {conAcciones && (
        <div className="mt-2.5 space-y-1">
          {b.cursoId && (
            <AccionBloque href={`/libro-clases/asistencia?cursoId=${b.cursoId}`} etiqueta="Pasar lista" />
          )}
          <AccionBloque href={`/libro-clases/calificaciones?asignaturaId=${b.asignaturaId}`} etiqueta="Libreta de notas" />
          <AccionBloque href={`/libro-clases/firma?asignaturaId=${b.asignaturaId}`} etiqueta="Firmar leccionario" />
          <AccionBloque href={`/libro-clases/evaluaciones?asignaturaId=${b.asignaturaId}`} etiqueta="Evaluaciones" />
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Banner de la próxima clase (o la que está en curso) */}
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

      {/* Cierre del popover al hacer clic fuera */}
      {sel && (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => setSel(null)}
          className="fixed inset-0 z-20 cursor-default"
          tabIndex={-1}
        />
      )}

      {/* Vista HOY: agenda del día */}
      {vista === "hoy" ? (
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
        /* Vista SEMANA: la grilla */
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie shadow-suave">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className="sticky left-0 z-10 w-16 bg-superficie px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                  Hora
                </th>
                {DIAS_LABORALES.map((dia) => (
                  <th
                    key={dia}
                    className={`px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide ${
                      dia === hoy ? "bg-marca-50 text-marca-700" : "text-tinta-tenue"
                    }`}
                  >
                    {NOMBRE_DIA[dia]}
                    {dia === hoy && <span className="ml-1 text-marca-500">hoy</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.horaInicio} className="border-b border-borde transition-colors last:border-0">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-superficie px-2 py-2 align-top text-xs tabular-nums text-tinta-tenue">
                    <div className="font-semibold text-tinta-suave">{fila.horaInicio}</div>
                    <div>{fila.horaFin}</div>
                  </td>
                  {fila.celdas.map((celda, i) => {
                    const dia = DIAS_LABORALES[i];
                    const esHoy = dia === hoy;
                    const est = celda && esHoy ? estadoBloque(celda) : null;
                    const abierto = celda && sel?.dia === dia && sel?.horaInicio === fila.horaInicio;
                    return (
                      <td
                        key={i}
                        className={`relative px-1.5 py-1.5 align-top transition-colors ${
                          esHoy ? "border-x border-marca-200/60 bg-marca-50/60" : ""
                        }`}
                      >
                        {celda ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setSel(abierto ? null : { dia, horaInicio: fila.horaInicio })
                              }
                              aria-expanded={Boolean(abierto)}
                              title={`${celda.asignatura} — clic para ver acciones`}
                              className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs leading-tight transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-marca-300 active:scale-[0.98] ${
                                colorAsignatura(celda.asignatura, celda.color).suave
                              } ${est === "pasada" ? "opacity-55" : ""} ${
                                est === "ahora" ? "ring-2 ring-marca-500 shadow-md" : ""
                              }`}
                            >
                              <span className="flex items-center gap-1 font-semibold">
                                {celda.asignatura}
                                {est === "ahora" && (
                                  <span className="rounded bg-marca-600 px-1 py-px text-[9px] font-bold uppercase text-white">
                                    Ahora
                                  </span>
                                )}
                              </span>
                              {mostrarCurso && celda.curso && (
                                <span className="block opacity-70">{celda.curso}</span>
                              )}
                            </button>
                            {abierto && <Popover b={celda} />}
                          </>
                        ) : mostrarHorasLibres ? (
                          <span className="block rounded-lg border border-dashed border-borde px-2 py-2 text-center text-[11px] font-medium text-tinta-tenue">
                            Hora libre
                          </span>
                        ) : (
                          <span className="sr-only">Libre</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
