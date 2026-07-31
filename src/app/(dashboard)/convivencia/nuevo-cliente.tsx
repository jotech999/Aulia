"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIAS_CASO } from "@/lib/convivencia";
import { crearCaso } from "./actions";
import { redactarActaIA } from "./ia-actions";
import { Boton } from "@/components/ui/boton";

type Estudiante = { id: string; nombre: string };

export function NuevoCaso({ estudiantes }: { estudiantes: Estudiante[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [estudianteId, setEstudianteId] = useState(estudiantes[0]?.id ?? "");
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_CASO[0]);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [redactando, setRedactando] = useState(false);

  // Redacción asistida: relato factual + pasos de debido proceso desde el apunte.
  async function redactarIA() {
    if (redactando || descripcion.trim().length < 5) return;
    setError(null);
    setRedactando(true);
    const r = await redactarActaIA(descripcion);
    setRedactando(false);
    if (r.ok) setDescripcion(r.texto);
    else setError(r.error);
  }
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (estudiantes.length === 0) return null;

  async function guardar() {
    setOcupado(true);
    setError(null);
    const res = await crearCaso({ estudianteId, categoria, titulo, descripcion });
    setOcupado(false);
    if (res.ok) {
      setAbierto(false);
      router.push(`/convivencia/${res.id}`);
    } else {
      setError(res.error);
    }
  }

  if (!abierto) {
    return (
      <Boton type="button" onClick={() => setAbierto(true)}>
        + Nuevo caso
      </Boton>
    );
  }

  return (
    <div className="rounded-xl border border-borde bg-superficie p-4 shadow-suave">
      <div className="flex flex-wrap gap-3">
        <label className="text-xs font-medium text-tinta-tenue">
          Estudiante
          <select
            value={estudianteId}
            onChange={(e) => setEstudianteId(e.target.value)}
            className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
          >
            {estudiantes.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-tinta-tenue">
          Categoría
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
          >
            {CATEGORIAS_CASO.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título breve (opcional)"
        aria-label="Título breve del caso, opcional"
        className="mt-3 w-full rounded-lg border border-borde px-3 py-2 text-sm"
      />
      <p className="mt-1 text-xs text-tinta-tenue">
        Si lo dejas vacío, usaremos la categoría como título para que puedas continuar rápido.
      </p>
      <textarea
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        rows={3}
        placeholder="Descripción de los hechos (fecha, contexto). Datos de salud van cifrados aparte, no aquí."
        className="mt-2 w-full rounded-lg border border-borde px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={() => void redactarIA()}
        disabled={redactando || descripcion.trim().length < 5}
        title="Convierte tu apunte en el relato factual con los pasos del debido proceso"
        className="mt-1.5 rounded-lg border border-marca-300 bg-marca-50 px-3 py-1.5 text-xs font-semibold text-marca-700 transition-colors hover:border-marca-500 disabled:opacity-50"
      >
        {redactando ? "Redactando…" : "✨ Redactar con debido proceso (IA)"}
      </button>
      {error && <p className="mt-2 text-sm text-peligro">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Boton
          type="button"
          onClick={() => void guardar()}
          disabled={ocupado || descripcion.trim().length < 5}
        >
          {ocupado ? "Creando…" : "Abrir caso"}
        </Boton>
        <Boton
          type="button"
          variante="fantasma"
          onClick={() => setAbierto(false)}
        >
          Cancelar
        </Boton>
      </div>
    </div>
  );
}
