"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import type { TipoAnotacion } from "@/lib/anotaciones";
import { crearAnotacion, eliminarAnotacion } from "./actions";
import { Boton } from "@/components/ui/boton";

type AnotacionItem = {
  id: string;
  tipo: TipoAnotacion;
  categoria: string | null;
  texto: string;
  fechaHecho: string | null;
  creadaEn: string;
  autorId: string;
  autorNombre: string;
};

const TIPO_UI: Record<TipoAnotacion, { label: string; badge: string; icono: string }> = {
  POSITIVA: { label: "Positiva", badge: "bg-exito-suave text-exito border-exito/20", icono: "＋" },
  NEGATIVA: { label: "Negativa", badge: "bg-peligro-suave text-peligro border-peligro/20", icono: "－" },
  NEUTRA: { label: "Neutra", badge: "bg-superficie-3 text-tinta-suave border-borde", icono: "•" },
};

function fmtFecha(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function Anotaciones({
  estudianteId,
  puedeCrear,
  autoAbrir = false,
  usuarioId,
  rol,
  anotaciones,
}: {
  estudianteId: string;
  puedeCrear: boolean;
  /** Abre el formulario y hace scroll (deep-link ?anotar=1 para registro rápido). */
  autoAbrir?: boolean;
  usuarioId: string;
  rol: string;
  anotaciones: AnotacionItem[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(puedeCrear && autoAbrir);
  const seccionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (puedeCrear && autoAbrir) {
      seccionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [puedeCrear, autoAbrir]);
  const [tipo, setTipo] = useState<TipoAnotacion>("NEUTRA");
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fechaHecho, setFechaHecho] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<string | null>(null);

  const puedeEliminar = (a: AnotacionItem) =>
    rol === "ADMIN" || rol === "DIRECTOR" || rol === "UTP" || a.autorId === usuarioId;

  async function enviar(omitirAdvertencia: boolean) {
    setGuardando(true);
    setError(null);
    const res = await crearAnotacion(
      {
        estudianteId,
        tipo,
        texto,
        categoria: categoria || undefined,
        fechaHecho: fechaHecho || null,
      },
      omitirAdvertencia
    );
    setGuardando(false);
    if (res.ok) {
      setTexto("");
      setCategoria("");
      setFechaHecho("");
      setTipo("NEUTRA");
      setAbierto(false);
      setAdvertencia(null);
      router.refresh();
    } else if (res.advertencia) {
      setAdvertencia(res.error);
    } else {
      setError(res.error);
    }
  }

  async function borrar(id: string) {
    const motivo = window.prompt(
      "Motivo de la eliminación (queda registrado en auditoría):"
    );
    if (!motivo) return;
    const res = await eliminarAnotacion({ anotacionId: id, motivo });
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "No se pudo eliminar la anotación.");
  }

  return (
    <section ref={seccionRef} id="hoja-de-vida" className="mt-8 scroll-mt-20">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hoja de vida · Anotaciones</h2>
        {puedeCrear && !abierto && (
          <Boton type="button" onClick={() => setAbierto(true)}>
            + Anotación
          </Boton>
        )}
      </div>

      {abierto && (
        <div className="mt-4 rounded-xl border border-borde bg-superficie p-4 shadow-suave">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TIPO_UI) as TipoAnotacion[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                  tipo === t ? TIPO_UI[t].badge + " ring-2 ring-marca-500/20" : "border-borde text-tinta-tenue hover:bg-superficie-2"
                }`}
              >
                {TIPO_UI[t].label}
              </button>
            ))}
          </div>

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="Describe el hecho de forma objetiva (qué pasó, cuándo, dónde). No incluyas datos de salud."
            className="mt-3 w-full rounded-xl border border-borde px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-marca-500/40"
          />

          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-tinta-tenue">
              Categoría (opcional)
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="convivencia, atrasos…"
                className="mt-0.5 block w-44 rounded-lg border border-borde px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-tinta-tenue">
              Fecha del hecho (opcional)
              <input
                type="date"
                value={fechaHecho}
                onChange={(e) => setFechaHecho(e.target.value)}
                className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {advertencia && (
            <div className="mt-3 rounded-xl border border-alerta/20 bg-alerta-suave p-3 text-sm text-alerta">
              {advertencia}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void enviar(true)}
                  disabled={guardando}
                  className="rounded-lg bg-alerta px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Guardar de todas formas
                </button>
                <button
                  type="button"
                  onClick={() => setAdvertencia(null)}
                  className="text-xs text-alerta underline"
                >
                  Editar el texto
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-peligro">{error}</p>}

          {!advertencia && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void enviar(false)}
                disabled={guardando || texto.trim().length < 5}
                className="btn btn-primario"
              >
                {guardando ? "Guardando…" : "Guardar anotación"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  setError(null);
                }}
                className="text-sm text-tinta-tenue hover:text-tinta"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {anotaciones.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
          Sin anotaciones registradas.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {anotaciones.map((a) => {
            const ui = TIPO_UI[a.tipo];
            return (
              <li
                key={a.id}
                className="rounded-xl border border-borde bg-superficie p-4 shadow-suave"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${ui.badge}`}
                    >
                      <span aria-hidden>{ui.icono}</span>
                      {ui.label}
                    </span>
                    {a.categoria && (
                      <span className="rounded-lg bg-superficie-3 px-2 py-0.5 text-xs text-tinta-tenue">
                        {a.categoria}
                      </span>
                    )}
                  </div>
                  {puedeEliminar(a) && (
                    <button
                      type="button"
                      onClick={() => void borrar(a.id)}
                      className="text-xs text-tinta-tenue hover:text-peligro"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-tinta">
                  {a.texto}
                </p>
                <p className="mt-2 text-xs text-tinta-tenue">
                  {a.autorNombre} ·{" "}
                  {a.fechaHecho ? `hecho ${fmtFecha(a.fechaHecho)} · ` : ""}
                  registrada {fmtFecha(a.creadaEn)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
