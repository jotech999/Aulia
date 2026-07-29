"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import {
  TIPOS_SEGUIMIENTO,
  NOMBRE_TIPO_SEGUIMIENTO,
  ESTADOS_CASO,
  type TipoSeguimiento,
  type EstadoCaso,
} from "@/lib/convivencia";
import { agregarSeguimiento, cambiarEstadoCaso } from "../actions";

export function GestionCaso({
  casoId,
  estado,
  hoy,
}: {
  casoId: string;
  estado: EstadoCaso;
  hoy: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoSeguimiento>("ENTREVISTA");
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    setOcupado(true);
    setError(null);
    const res = await agregarSeguimiento({ casoId, tipo, texto, fecha });
    setOcupado(false);
    if (res.ok) {
      setTexto("");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function cambiar(nuevo: EstadoCaso) {
    const res = await cambiarEstadoCaso({ casoId, estado: nuevo });
    if (res.ok) router.refresh();
    else toast.error(res.error);
  }

  return (
    <div className="mt-6 rounded-xl border border-borde bg-superficie p-4 shadow-suave">
      <h2 className="text-sm font-semibold text-tinta">Registrar seguimiento</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <label className="text-xs font-medium text-tinta-tenue">
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoSeguimiento)}
            className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
          >
            {TIPOS_SEGUIMIENTO.map((t) => (
              <option key={t} value={t}>{NOMBRE_TIPO_SEGUIMIENTO[t]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-tinta-tenue">
          Fecha
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        placeholder="Síntesis: participantes, acuerdos, medidas, notificación…"
        className="mt-2 w-full rounded-lg border border-borde px-3 py-2 text-sm"
      />
      {error && <p className="mt-2 text-sm text-peligro">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Boton
          type="button"
          onClick={() => void agregar()}
          disabled={ocupado || texto.trim().length < 3}
        >
          {ocupado ? "Guardando…" : "Agregar seguimiento"}
        </Boton>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-tinta-tenue">Estado:</span>
          {ESTADOS_CASO.filter((e) => e !== estado).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => void cambiar(e)}
              className="rounded-lg border border-borde px-2 py-1 font-medium text-tinta-suave hover:bg-superficie-2"
            >
              {e === "CERRADO" ? "Cerrar" : e === "ABIERTO" ? "Reabrir" : "En seguimiento"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
