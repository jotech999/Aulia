"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearAnotacionesLote } from "./actions";
import { toast } from "@/components/ui/toast";

type Estudiante = { id: string; nombre: string };
type Tipo = "POSITIVA" | "NEGATIVA" | "NEUTRA";

const TIPOS: { tipo: Tipo; etiqueta: string; clase: string; activo: string }[] = [
  { tipo: "POSITIVA", etiqueta: "Positiva", clase: "text-exito", activo: "border-exito bg-exito-suave text-exito" },
  { tipo: "NEUTRA", etiqueta: "Neutra", clase: "text-tinta-suave", activo: "border-marca-500 bg-marca-50 text-marca-700" },
  { tipo: "NEGATIVA", etiqueta: "Negativa", clase: "text-peligro", activo: "border-peligro bg-peligro-suave text-peligro" },
];

const campo =
  "mt-1 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-200";

export function AnotacionLote({ cursoId, estudiantes }: { cursoId: string; estudiantes: Estudiante[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tipo, setTipo] = useState<Tipo>("POSITIVA");
  const [categoria, setCategoria] = useState("");
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<string | null>(null);

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const todos = sel.size === estudiantes.length && estudiantes.length > 0;
  function toggleTodos() {
    setSel(todos ? new Set() : new Set(estudiantes.map((e) => e.id)));
  }

  async function guardar() {
    if (sel.size === 0) { setError("Selecciona al menos un estudiante."); return; }
    setOcupado(true);
    setError(null);
    setAdvertencia(null);
    const res = await crearAnotacionesLote({
      cursoId, estudianteIds: [...sel], tipo, categoria, texto, fechaHecho: fecha,
    });
    setOcupado(false);
    if (res.ok) {
      toast.exito(`Anotación registrada en ${res.creadas} estudiante(s).`);
      setSel(new Set());
      setTexto("");
      setCategoria("");
      router.refresh();
    } else if (res.advertencia) {
      setAdvertencia(res.error);
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
      {/* Lista con selección */}
      <div className="rounded-xl border border-borde bg-superficie">
        <div className="flex items-center justify-between border-b border-borde px-4 py-2.5">
          <span className="text-sm font-semibold text-tinta">{sel.size} seleccionado(s)</span>
          <button type="button" onClick={toggleTodos} className="text-xs font-medium text-marca-600 hover:text-marca-700">
            {todos ? "Quitar todos" : "Seleccionar todos"}
          </button>
        </div>
        <ul className="max-h-[60vh] divide-y divide-borde overflow-y-auto">
          {estudiantes.map((e) => {
            const activo = sel.has(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  aria-pressed={activo}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${activo ? "bg-marca-50" : "hover:bg-superficie-2"}`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${activo ? "border-marca-500 bg-marca-600 text-white" : "border-borde-fuerte"}`} aria-hidden>
                    {activo && (
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M4 10.5l3.5 3.5L16 5.5" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate font-medium text-tinta">{e.nombre}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Formulario de la anotación */}
      <div className="rounded-xl border border-borde bg-superficie p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">Tipo</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {TIPOS.map((t) => (
            <button
              key={t.tipo}
              type="button"
              onClick={() => setTipo(t.tipo)}
              aria-pressed={tipo === t.tipo}
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${tipo === t.tipo ? t.activo : `border-borde ${t.clase} hover:bg-superficie-2`}`}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-xs font-medium text-tinta-suave">
          Categoría (opcional)
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={60} placeholder="Ej: reconocimiento, atrasos" className={campo} />
        </label>

        <label className="mt-3 block text-xs font-medium text-tinta-suave">
          Descripción del hecho
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={1000} placeholder="Constata el hecho, sin datos de salud." className={campo} />
        </label>

        <label className="mt-3 block text-xs font-medium text-tinta-suave">
          Fecha del hecho (opcional)
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
        </label>

        {error && <p className="mt-2 rounded-lg bg-peligro-suave px-3 py-2 text-xs text-peligro">{error}</p>}
        {advertencia && (
          <div className="mt-2 rounded-lg border border-alerta/30 bg-alerta-suave px-3 py-2 text-xs text-alerta">
            <p>{advertencia}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => guardar()}
          disabled={ocupado || sel.size === 0}
          className="mt-4 w-full rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-marca-700 disabled:opacity-50"
        >
          {ocupado ? "Guardando…" : `Registrar en ${sel.size || ""} estudiante(s)`}
        </button>
        {sel.size > 1 && (
          <p className="mt-2 text-center text-xs text-tinta-tenue">
            Se crearán {sel.size} registros individuales y trazables, uno por estudiante.
          </p>
        )}
      </div>
    </div>
  );
}
