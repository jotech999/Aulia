"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearEvento } from "./actions";
import { ESTILO_EVENTO, type TipoEventoVista } from "@/lib/calendario";

const TIPOS = Object.keys(ESTILO_EVENTO) as TipoEventoVista[];

export function NuevoEvento({
  cursos,
  fechaInicial,
  autoAbrir = false,
}: {
  cursos: { id: string; nombre: string }[];
  fechaInicial: string;
  /** Abre el formulario de entrada (p. ej. al hacer clic en un día del calendario). */
  autoAbrir?: boolean;
}) {
  const [abierto, setAbierto] = useState(autoAbrir);
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(fechaInicial);
  const [tipo, setTipo] = useState<TipoEventoVista>("GENERAL");
  const [cursoId, setCursoId] = useState("");
  const [avisar, setAvisar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await crearEvento({ titulo, fecha, tipo, cursoId: cursoId || null, avisarApoderados: avisar });
      if (r.ok) {
        setTitulo("");
        setCursoId("");
        setTipo("GENERAL");
        setAvisar(false);
        setAbierto(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="btn btn-primario"
      >
        + Nuevo evento
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
      className="superficie w-full max-w-md rounded-xl p-4"
    >
      <div className="grid gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-tinta-suave">Título</span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            autoFocus
            placeholder="Reunión de apoderados"
            className="w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm outline-none focus:border-marca-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-tinta-suave">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
              className="w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm outline-none focus:border-marca-500"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-tinta-suave">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoEventoVista)}
              className="w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm outline-none focus:border-marca-500"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ESTILO_EVENTO[t].etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-tinta-suave">
            Curso <span className="text-tinta-tenue">(opcional — vacío = todo el colegio)</span>
          </span>
          <select
            value={cursoId}
            onChange={(e) => setCursoId(e.target.value)}
            className="w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm outline-none focus:border-marca-500"
          >
            <option value="">Todo el colegio</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={avisar}
            onChange={(e) => setAvisar(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-borde text-marca-600 focus:ring-marca-500"
          />
          <span className="text-tinta-suave">
            Avisar a los apoderados
            <span className="block text-xs text-tinta-tenue">
              Les llega por la campana y el correo. {cursoId ? "Solo del curso elegido." : "De todo el colegio."}
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-peligro">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="btn btn-fantasma"
          >
            Cancelar
          </button>
          <button type="submit" disabled={pendiente} className="btn btn-primario">
            {pendiente ? "Guardando…" : "Guardar evento"}
          </button>
        </div>
      </div>
    </form>
  );
}
