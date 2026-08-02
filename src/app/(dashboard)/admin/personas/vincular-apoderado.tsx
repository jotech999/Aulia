"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { toast } from "@/components/ui/toast";
import { buscarApoderados, vincularApoderado } from "./actions";

type Candidato = {
  usuarioId: string;
  nombre: string;
  email: string;
  rutParcial: string;
  pupilos: string[];
};

/**
 * Vincula a un apoderado YA REGISTRADO con este estudiante.
 *
 * Existe por el caso de los hermanos: antes, para el segundo hijo había que
 * volver a escribir RUT, nombre y correo de la misma persona, con el riesgo de
 * crear una cuenta duplicada por un tipeo. Aquí se busca y se elige.
 */
export function VincularApoderado({ estudianteId }: { estudianteId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<Candidato[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [parentesco, setParentesco] = useState("Apoderado");
  const [error, setError] = useState<string | null>(null);

  // Búsqueda con espera: no dispara una consulta por cada tecla.
  useEffect(() => {
    if (!abierto || consulta.trim().length < 2) {
      setResultados([]);
      return;
    }
    let vigente = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscarApoderados({ consulta, estudianteId });
      if (!vigente) return;
      setBuscando(false);
      if (r.ok) setResultados(r.resultados);
      else setError(r.error);
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [consulta, abierto, estudianteId]);

  async function vincular(c: Candidato) {
    setError(null);
    setVinculando(c.usuarioId);
    try {
      const r = await vincularApoderado({
        estudianteId,
        apoderadoUsuarioId: c.usuarioId,
        parentesco,
      });
      if (r.ok) {
        toast.exito(`${c.nombre} quedó vinculada a este estudiante.`);
        setAbierto(false);
        setConsulta("");
        setResultados([]);
        router.refresh();
      } else setError(r.error);
    } finally {
      setVinculando(null);
    }
  }

  if (!abierto) {
    return (
      <Boton type="button" variante="secundario" tamano="sm" onClick={() => setAbierto(true)}>
        + Vincular apoderado existente
      </Boton>
    );
  }

  return (
    <div className="rounded-xl border border-borde bg-superficie-2 p-3">
      <p className="text-sm font-semibold text-tinta">Vincular un apoderado ya registrado</p>
      <p className="mt-0.5 text-xs text-tinta-tenue">
        Útil cuando ya tiene otro hijo en el colegio: se usa su misma cuenta en vez de crear una
        nueva.
      </p>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          autoFocus
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Nombre, correo o RUT…"
          aria-label="Buscar apoderado"
          className="min-h-11 flex-1 rounded-lg border border-borde bg-superficie px-3 text-sm outline-none transition focus:border-marca-500 focus:ring-2 focus:ring-marca-200"
        />
        <label className="text-xs font-medium text-tinta-tenue">
          <span className="sr-only">Parentesco</span>
          <select
            value={parentesco}
            onChange={(e) => setParentesco(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-borde bg-superficie px-2 text-sm sm:w-auto"
          >
            <option>Apoderado</option>
            <option>Madre</option>
            <option>Padre</option>
            <option>Tutor(a)</option>
            <option>Abuelo(a)</option>
            <option>Suplente</option>
          </select>
        </label>
      </div>

      {error && <p className="mt-2 text-sm text-peligro">{error}</p>}

      <div className="mt-2">
        {consulta.trim().length < 2 ? (
          <p className="text-xs text-tinta-tenue">Escribe al menos dos letras para buscar.</p>
        ) : buscando ? (
          <p className="animate-pulse text-xs text-tinta-tenue">Buscando…</p>
        ) : resultados.length === 0 ? (
          <p className="text-xs text-tinta-tenue">
            Nadie coincide (o ya está vinculado a este estudiante). Si es alguien nuevo, agrégalo
            desde Personas.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {resultados.map((c) => (
              <li
                key={c.usuarioId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-superficie px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-tinta">{c.nombre}</p>
                  <p className="truncate text-xs text-tinta-tenue">
                    {c.email} · {c.rutParcial}
                  </p>
                  {c.pupilos.length > 0 && (
                    <p className="text-xs text-tinta-tenue">
                      Ya es apoderado de: {c.pupilos.join(", ")}
                    </p>
                  )}
                </div>
                <Boton
                  type="button"
                  tamano="sm"
                  disabled={vinculando !== null}
                  onClick={() => void vincular(c)}
                >
                  {vinculando === c.usuarioId ? "Vinculando…" : "Vincular"}
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="mt-2 text-sm text-tinta-tenue hover:text-tinta"
      >
        Cancelar
      </button>
    </div>
  );
}
