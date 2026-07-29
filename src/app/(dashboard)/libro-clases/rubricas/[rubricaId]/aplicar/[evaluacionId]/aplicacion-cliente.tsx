"use client";

import { useMemo, useState } from "react";
import { guardarAplicacionRubrica } from "../../../actions";
import { calcularPuntajeRubrica } from "@/lib/rubricas";
import { Boton } from "@/components/ui/boton";
import { confirmar } from "@/components/ui/confirmar";
import { Insignia } from "@/components/ui/insignia";
import { toast } from "@/components/ui/toast";

type Nivel = { id: string; etiqueta: string; descriptor: string; puntaje: number };
type Criterio = {
  id: string;
  descripcion: string;
  peso: number;
  puntajeMax: number;
  niveles: Nivel[];
};
type Aplicacion = {
  id: string;
  estado: "BORRADOR" | "FINALIZADA" | "ANULADA";
  puntajeTotal: number | null;
  retroalimentacion: string;
  puntajes: Array<{ criterioId: string; nivelId: string | null; comentario: string }>;
} | null;
type Estudiante = { id: string; nombre: string; aplicacion: Aplicacion };

type Edicion = {
  aplicacionId?: string;
  estado: "SIN_INICIAR" | "BORRADOR" | "FINALIZADA" | "ANULADA";
  niveles: Record<string, string>;
  comentarios: Record<string, string>;
  retroalimentacion: string;
  sucio: boolean;
};

const campo =
  "mt-1 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-200 disabled:cursor-not-allowed disabled:bg-superficie-2";

function crearEdiciones(estudiantes: Estudiante[]): Record<string, Edicion> {
  return Object.fromEntries(
    estudiantes.map((estudiante) => {
      const aplicacion = estudiante.aplicacion;
      return [
        estudiante.id,
        {
          aplicacionId: aplicacion?.id,
          estado: aplicacion?.estado ?? "SIN_INICIAR",
          niveles: Object.fromEntries(
            (aplicacion?.puntajes ?? [])
              .filter((puntaje) => puntaje.nivelId)
              .map((puntaje) => [puntaje.criterioId, puntaje.nivelId!])
          ),
          comentarios: Object.fromEntries(
            (aplicacion?.puntajes ?? []).map((puntaje) => [puntaje.criterioId, puntaje.comentario])
          ),
          retroalimentacion: aplicacion?.retroalimentacion ?? "",
          sucio: false,
        } satisfies Edicion,
      ];
    })
  );
}

const etiquetaEstado = {
  SIN_INICIAR: "Sin iniciar",
  BORRADOR: "Borrador",
  FINALIZADA: "Finalizada",
  ANULADA: "Anulada",
} as const;

const tonoEstado = {
  SIN_INICIAR: "neutra",
  BORRADOR: "alerta",
  FINALIZADA: "exito",
  ANULADA: "peligro",
} as const;

export function AplicacionRubricaCliente({
  rubricaId,
  evaluacionId,
  criterios,
  estudiantes,
}: {
  rubricaId: string;
  evaluacionId: string;
  criterios: Criterio[];
  estudiantes: Estudiante[];
}) {
  const [estudianteId, setEstudianteId] = useState(estudiantes[0]?.id ?? "");
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>(() => crearEdiciones(estudiantes));
  const [guardando, setGuardando] = useState(false);
  const estudiante = estudiantes.find((item) => item.id === estudianteId)!;
  const edicion = ediciones[estudianteId];
  const soloLectura = edicion.estado === "FINALIZADA" || edicion.estado === "ANULADA";

  const calculo = useMemo(() => {
    const selecciones = criterios.flatMap((criterio) => {
      const nivelId = edicion?.niveles[criterio.id];
      const nivel = criterio.niveles.find((item) => item.id === nivelId);
      return nivel ? [{ criterioId: criterio.id, puntaje: nivel.puntaje }] : [];
    });
    return calcularPuntajeRubrica(criterios, selecciones);
  }, [criterios, edicion]);

  function cambiarEdicion(cambio: Partial<Edicion>) {
    setEdiciones((actual) => ({
      ...actual,
      [estudianteId]: { ...actual[estudianteId], ...cambio, sucio: true },
    }));
  }

  function elegirNivel(criterioId: string, nivelId: string) {
    cambiarEdicion({ niveles: { ...edicion.niveles, [criterioId]: nivelId } });
  }

  async function guardar(finalizar: boolean) {
    if (finalizar && Object.keys(edicion.niveles).length !== criterios.length) {
      toast.error("Selecciona un nivel para cada criterio antes de finalizar.");
      return;
    }
    if (finalizar) {
      const ok = await confirmar({
        titulo: `¿Finalizar la aplicación de ${estudiante.nombre}?`,
        mensaje: "El resultado y la retroalimentación quedarán cerrados en esta versión. Esto no crea una nota.",
        textoConfirmar: "Finalizar aplicación",
      });
      if (!ok) return;
    }

    setGuardando(true);
    const resultado = await guardarAplicacionRubrica({
      rubricaId,
      evaluacionId,
      estudianteId,
      retroalimentacion: edicion.retroalimentacion,
      finalizar,
      selecciones: criterios.flatMap((criterio) => {
        const nivelId = edicion.niveles[criterio.id];
        return nivelId
          ? [{ criterioId: criterio.id, nivelId, comentario: edicion.comentarios[criterio.id] ?? "" }]
          : [];
      }),
    });
    setGuardando(false);
    if (!resultado.ok) return toast.error(resultado.error);

    const estado = finalizar ? "FINALIZADA" : "BORRADOR";
    setEdiciones((actual) => ({
      ...actual,
      [estudianteId]: {
        ...actual[estudianteId],
        aplicacionId: resultado.aplicacionId,
        estado,
        sucio: false,
      },
    }));
    toast.exito(finalizar ? "Aplicación finalizada." : "Borrador guardado.");

    if (finalizar) {
      const indice = estudiantes.findIndex((item) => item.id === estudianteId);
      const siguiente = [...estudiantes.slice(indice + 1), ...estudiantes.slice(0, indice)].find(
        (item) => ediciones[item.id].estado !== "FINALIZADA"
      );
      if (siguiente) setEstudianteId(siguiente.id);
    }
  }

  function seleccionarEstudiante(id: string) {
    setEstudianteId(id);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="self-start rounded-xl border border-borde bg-superficie lg:sticky lg:top-4" aria-label="Estudiantes">
        <div className="border-b border-borde px-4 py-3">
          <p className="text-sm font-semibold text-tinta">Curso</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            {Object.values(ediciones).filter((item) => item.estado === "FINALIZADA").length} de {estudiantes.length} finalizadas
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto p-2 lg:block lg:max-h-[70vh] lg:space-y-1 lg:overflow-y-auto">
          {estudiantes.map((item, indice) => {
            const estado = ediciones[item.id].estado;
            const activo = item.id === estudianteId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => seleccionarEstudiante(item.id)}
                aria-pressed={activo}
                className={`min-w-56 rounded-lg px-3 py-2.5 text-left transition lg:min-w-0 lg:w-full ${activo ? "bg-marca-50 ring-1 ring-marca-300" : "hover:bg-superficie-2"}`}
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-superficie-3 text-xs font-bold text-tinta-suave">{indice + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-tinta">{item.nombre}</span>
                  {ediciones[item.id].sucio && <span className="h-2 w-2 shrink-0 rounded-full bg-alerta" title="Cambios sin guardar" />}
                </span>
                <span className="ml-8 mt-1 block text-[11px] font-medium text-tinta-tenue">{etiquetaEstado[estado]}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="min-w-0">
        <div className="superficie mb-4 rounded-xl p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">Estudiante</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-tinta">{estudiante.nombre}</h2>
              <div className="mt-2"><Insignia tono={tonoEstado[edicion.estado]} punto>{etiquetaEstado[edicion.estado]}</Insignia></div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">Puntaje actual</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-marca-700">
                {calculo.total} <span className="text-base font-medium text-tinta-tenue">/ {calculo.maximo}</span>
              </p>
              <p className="text-xs text-tinta-tenue">{calculo.porcentaje}% de logro · sin conversión a nota</p>
            </div>
          </div>
        </div>

        <div className="hidden overflow-hidden rounded-xl border border-borde bg-superficie md:block">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="bg-superficie-2 text-left text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
              <tr>
                <th className="w-1/3 px-4 py-3">Criterio</th>
                <th className="px-4 py-3">Nivel de desempeño</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {criterios.map((criterio, indice) => (
                <tr key={criterio.id} className="align-top">
                  <th scope="row" className="px-4 py-4 text-left font-medium text-tinta">
                    <span className="mr-2 text-xs text-tinta-tenue">{indice + 1}.</span>{criterio.descripcion}
                    <span className="mt-1 block text-xs font-normal text-tinta-tenue">Peso {criterio.peso}</span>
                  </th>
                  <td className="px-4 py-4">
                    <div className="grid gap-2 xl:grid-cols-2">
                      {criterio.niveles.map((nivel) => {
                        const activo = edicion.niveles[criterio.id] === nivel.id;
                        return (
                          <label key={nivel.id} className={`cursor-pointer rounded-lg border p-3 transition ${activo ? "border-marca-500 bg-marca-50 ring-1 ring-marca-300" : "border-borde hover:bg-superficie-2"} ${soloLectura ? "cursor-default" : ""}`}>
                            <span className="flex items-start gap-2">
                              <input
                                type="radio"
                                name={`nivel-${estudianteId}-${criterio.id}`}
                                checked={activo}
                                onChange={() => elegirNivel(criterio.id, nivel.id)}
                                disabled={soloLectura}
                                className="mt-0.5 h-4 w-4 accent-marca-600"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-2 font-semibold text-tinta">
                                  {nivel.etiqueta}<span className="shrink-0 text-xs tabular-nums text-marca-700">{nivel.puntaje} pt</span>
                                </span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-tinta-suave">{nivel.descriptor}</span>
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <label className="mt-2 block text-xs font-medium text-tinta-suave">
                      Comentario del criterio (opcional)
                      <input
                        value={edicion.comentarios[criterio.id] ?? ""}
                        onChange={(event) => cambiarEdicion({ comentarios: { ...edicion.comentarios, [criterio.id]: event.target.value } })}
                        disabled={soloLectura}
                        maxLength={800}
                        className={campo}
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {criterios.map((criterio, indice) => (
            <fieldset key={criterio.id} className="superficie rounded-xl p-4" disabled={soloLectura}>
              <legend className="sr-only">{criterio.descripcion}</legend>
              <p className="font-semibold text-tinta"><span className="mr-2 text-xs text-tinta-tenue">{indice + 1}.</span>{criterio.descripcion}</p>
              <p className="mt-0.5 text-xs text-tinta-tenue">Peso {criterio.peso}</p>
              <div className="mt-3 space-y-2">
                {criterio.niveles.map((nivel) => {
                  const activo = edicion.niveles[criterio.id] === nivel.id;
                  return (
                    <label key={nivel.id} className={`flex min-h-11 cursor-pointer gap-3 rounded-lg border p-3 ${activo ? "border-marca-500 bg-marca-50" : "border-borde"}`}>
                      <input type="radio" name={`movil-${estudianteId}-${criterio.id}`} checked={activo} onChange={() => elegirNivel(criterio.id, nivel.id)} className="mt-0.5 h-4 w-4 accent-marca-600" />
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2 text-sm font-semibold text-tinta"><span>{nivel.etiqueta}</span><span className="text-xs text-marca-700">{nivel.puntaje} pt</span></span>
                        <span className="mt-0.5 block text-xs text-tinta-suave">{nivel.descriptor}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <label className="mt-3 block text-xs font-medium text-tinta-suave">
                Comentario (opcional)
                <input value={edicion.comentarios[criterio.id] ?? ""} onChange={(event) => cambiarEdicion({ comentarios: { ...edicion.comentarios, [criterio.id]: event.target.value } })} maxLength={800} className={campo} />
              </label>
            </fieldset>
          ))}
        </div>

        <section className="superficie mt-4 rounded-xl p-4 sm:p-5" aria-labelledby="retroalimentacion-estudiante">
          <h3 id="retroalimentacion-estudiante" className="font-display text-lg font-semibold text-tinta">Retroalimentación global</h3>
          <p className="mt-0.5 text-xs text-tinta-suave">Describe fortalezas, próximos pasos y apoyos concretos. Evita datos sensibles innecesarios.</p>
          <label className="sr-only" htmlFor="retroalimentacion-rubrica">Retroalimentación</label>
          <textarea
            id="retroalimentacion-rubrica"
            value={edicion.retroalimentacion}
            onChange={(event) => cambiarEdicion({ retroalimentacion: event.target.value })}
            disabled={soloLectura}
            rows={5}
            maxLength={3000}
            placeholder="Fortalezas observadas y próximo desafío…"
            className={`${campo} mt-3`}
          />
        </section>

        <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-superficie/95 p-3 shadow-elevada backdrop-blur">
          <p className="text-xs text-tinta-suave" aria-live="polite">
            {soloLectura ? "Aplicación cerrada y de solo lectura." : edicion.sucio ? "Hay cambios sin guardar." : edicion.estado === "BORRADOR" ? "Borrador guardado." : "Completa los criterios o guarda un avance."}
          </p>
          {!soloLectura && (
            <div className="flex gap-2">
              <Boton type="button" variante="secundario" onClick={() => guardar(false)} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar borrador"}
              </Boton>
              <Boton type="button" onClick={() => guardar(true)} disabled={guardando}>
                Finalizar
              </Boton>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
