"use client";

/**
 * AGENDAR EN EL DÍA (isla de cliente) — pedido docente: igual que en el
 * horario, se toca directamente la fecha y el formulario de evaluación
 * aparece AHÍ, anclado a la celda del día, sin recargar la página.
 *
 * Solo un popover abierto a la vez (los demás se cierran por evento global);
 * en las columnas del borde derecho se alinea a la derecha y en las últimas
 * semanas del mes se abre hacia arriba, para no salirse del marco.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearEvaluacion } from "../libro-clases/calificaciones/actions";
import { crearEventoPersonal } from "./actions";
import { semestreEscolar } from "@/lib/fecha";
import { toast } from "@/components/ui/toast";

const EVENTO_CERRAR = "aulia:cerrar-agendar-dia";

export function AgendarDia({
  iso,
  dia,
  claseDia,
  claseCelda,
  asignaturas,
  columna,
  haciaArriba,
  children,
}: {
  iso: string; // YYYY-MM-DD del día tocado
  dia: number; // número que se muestra
  claseDia: string; // clases del circulito del número (mismas del server)
  claseCelda: string; // clases de la CELDA completa (hoy, fuera de mes, etc.)
  asignaturas: { id: string; nombre: string }[];
  columna: number; // 0=lunes … 6=domingo (para alinear el popover)
  haciaArriba: boolean; // últimas semanas: abrir hacia arriba
  children?: React.ReactNode; // los eventos del día (server-rendered)
}) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<"evaluacion" | "personal">(
    asignaturas.length > 0 ? "evaluacion" : "personal"
  );
  const [tituloPersonal, setTituloPersonal] = useState("");
  const [asignaturaId, setAsignaturaId] = useState(asignaturas[0]?.id ?? "");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"SUMATIVA" | "FORMATIVA">("SUMATIVA");
  const [ponderacion, setPonderacion] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  // Solo un popover abierto: al abrir uno, los demás escuchan y se cierran.
  useEffect(() => {
    function cerrar(e: Event) {
      if ((e as CustomEvent).detail !== iso) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    window.addEventListener(EVENTO_CERRAR, cerrar);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENTO_CERRAR, cerrar);
      window.removeEventListener("keydown", onKey);
    };
  }, [iso]);

  function abrir() {
    window.dispatchEvent(new CustomEvent(EVENTO_CERRAR, { detail: iso }));
    setError(null);
    setAbierto((v) => !v);
  }

  function agendar() {
    setError(null);
    startTransition(async () => {
      const r = await crearEvaluacion({
        asignaturaId,
        nombre,
        tipo,
        ponderacion,
        periodo: semestreEscolar(iso.slice(0, 7)),
        fecha: iso,
      });
      if (r.ok) {
        toast.exito("Evaluación agendada. Los apoderados del curso la verán en su calendario.");
        setNombre("");
        setAbierto(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  function guardarPersonal() {
    setError(null);
    startTransition(async () => {
      const r = await crearEventoPersonal({ titulo: tituloPersonal, fecha: iso });
      if (r.ok) {
        toast.exito("Nota personal guardada. Solo tú la ves.");
        setTituloPersonal("");
        setAbierto(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  const fechaLegible = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          abrir();
        }
      }}
      aria-expanded={abierto}
      title="Tocar para agendar en este día"
      className={`${claseCelda} relative cursor-pointer`}
    >
      <span className={claseDia}>{dia}</span>
      {children}

      {abierto && (
        <>
          {/* Telón transparente para cerrar al hacer clic fuera */}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={(e) => {
              e.stopPropagation();
              setAbierto(false);
            }}
            className="fixed inset-0 z-30 cursor-default"
            tabIndex={-1}
          />
          <div
            role="dialog"
            aria-label={`Agendar el ${fechaLegible}`}
            onClick={(e) => e.stopPropagation()}
            className={`absolute z-40 w-64 cursor-default rounded-xl border border-borde bg-superficie p-3 text-left shadow-flotante ${
              columna >= 4 ? "right-1" : "left-1"
            } ${haciaArriba ? "bottom-full mb-1.5" : "top-8"}`}
          >
            <p className="text-sm font-bold capitalize text-tinta">{fechaLegible}</p>

            {asignaturas.length > 0 ? (
              <div className="mt-2 flex gap-1">
                {(
                  [
                    ["evaluacion", "Evaluación"],
                    ["personal", "Personal"],
                  ] as const
                ).map(([id, etiqueta]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPestana(id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      pestana === id
                        ? "bg-marca-600 text-white"
                        : "border border-borde text-tinta-suave hover:text-tinta"
                    }`}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-tinta-tenue">Nota personal</p>
            )}

            {pestana === "personal" && (
              <div className="mt-2.5 space-y-2">
                <input
                  value={tituloPersonal}
                  onChange={(e) => setTituloPersonal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tituloPersonal.trim()) guardarPersonal();
                  }}
                  placeholder="Ej: consejo de profesores, dentista…"
                  maxLength={120}
                  autoFocus
                  className="w-full rounded-lg border border-borde px-2 py-1.5 text-sm"
                />
                <p className="text-[11px] leading-snug text-tinta-tenue">
                  Solo tú la ves en tu calendario; nadie más del colegio.
                </p>
                {error && (
                  <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-2.5 py-1.5 text-xs text-peligro">
                    {error}
                  </p>
                )}
                <div className="flex items-center justify-between pt-0.5">
                  <button type="button" onClick={() => setAbierto(false)} className="text-xs text-tinta-tenue hover:text-tinta">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={guardarPersonal}
                    disabled={pendiente || !tituloPersonal.trim()}
                    className="btn btn-primario btn-sm"
                  >
                    {pendiente ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            )}

            {pestana === "evaluacion" && asignaturas.length > 0 && (
            <div className="mt-2.5 space-y-2">
              <select
                value={asignaturaId}
                onChange={(e) => setAsignaturaId(e.target.value)}
                aria-label="Asignatura"
                className="w-full rounded-lg border border-borde px-2 py-1.5 text-sm"
              >
                {asignaturas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nombre.trim()) agendar();
                }}
                placeholder="Nombre (ej: Prueba unidad 2)"
                maxLength={160}
                autoFocus
                className="w-full rounded-lg border border-borde px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as "SUMATIVA" | "FORMATIVA")}
                  aria-label="Tipo"
                  className="flex-1 rounded-lg border border-borde px-2 py-1.5 text-sm"
                >
                  <option value="SUMATIVA">Sumativa</option>
                  <option value="FORMATIVA">Formativa</option>
                </select>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={ponderacion}
                  onChange={(e) => setPonderacion(Number(e.target.value))}
                  aria-label="Ponderación"
                  title="Ponderación"
                  className="w-16 rounded-lg border border-borde px-2 py-1.5 text-sm"
                />
              </div>
              {error && (
                <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-2.5 py-1.5 text-xs text-peligro">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between pt-0.5">
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="text-xs text-tinta-tenue hover:text-tinta"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={agendar}
                  disabled={pendiente || !nombre.trim()}
                  className="btn btn-primario btn-sm"
                >
                  {pendiente ? "Agendando…" : "Agendar"}
                </button>
              </div>
            </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
