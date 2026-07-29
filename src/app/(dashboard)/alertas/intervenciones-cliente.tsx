"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { registrarIntervencion, cerrarIntervencion } from "./actions";
import { Boton } from "@/components/ui/boton";

type Intervencion = { id: string; accion: string; responsable: string; fechaISO: string; proximoControlISO: string | null };

const campo = "mt-1 w-full rounded-lg border border-borde-fuerte bg-superficie px-2.5 py-1.5 text-sm focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";

export function Intervenciones({ estudianteId, abiertas }: { estudianteId: string; abiertas: Intervencion[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function registrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setOcupado(true);
    const fd = new FormData(e.currentTarget);
    const res = await registrarIntervencion({
      estudianteId,
      accion: String(fd.get("accion") ?? ""),
      responsable: String(fd.get("responsable") ?? ""),
      fecha: String(fd.get("fecha") ?? ""),
      proximoControl: String(fd.get("proximoControl") ?? ""),
      notas: String(fd.get("notas") ?? ""),
    });
    setOcupado(false);
    if (res.ok) { setAbierto(false); router.refresh(); } else setError(res.error);
  }

  async function cerrar(id: string) {
    const res = await cerrarIntervencion(id);
    if (res.ok) router.refresh(); else toast.error(res.error);
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">Intervenciones (dupla / UTP)</p>
      {abiertas.length > 0 && (
        <ul className="mt-1.5 space-y-1.5">
          {abiertas.map((iv) => (
            <li key={iv.id} className="flex items-start justify-between gap-2 rounded-lg bg-superficie-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-tinta">{iv.accion}</p>
                <p className="text-xs text-tinta-tenue">
                  {iv.responsable} · {iv.fechaISO}
                  {iv.proximoControlISO ? ` · próximo control ${iv.proximoControlISO}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => cerrar(iv.id)} className="shrink-0 text-xs font-medium text-marca-600 hover:text-marca-700">Cerrar</button>
            </li>
          ))}
        </ul>
      )}

      {abierto ? (
        <form onSubmit={registrar} className="mt-2 space-y-2 rounded-lg border border-borde bg-superficie p-3">
          {error && <p className="rounded bg-peligro-suave px-2 py-1 text-xs text-peligro">{error}</p>}
          <input name="accion" required maxLength={500} placeholder="Acción realizada (ej: entrevista con apoderado, derivación a psicólogo)" className={campo} />
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="responsable" required maxLength={120} placeholder="Responsable" className={campo} />
            <label className="text-xs text-tinta-tenue">Fecha<input name="fecha" type="date" required defaultValue={hoy} max={hoy} className={campo} /></label>
            <label className="text-xs text-tinta-tenue">Próximo control<input name="proximoControl" type="date" className={campo} /></label>
          </div>
          <div className="flex gap-2">
            <Boton type="submit" tamano="sm" disabled={ocupado}>{ocupado ? "Guardando…" : "Registrar"}</Boton>
            <Boton type="button" tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className="mt-1.5 text-xs font-medium text-marca-600 hover:text-marca-700">+ Registrar intervención</button>
      )}
    </div>
  );
}
