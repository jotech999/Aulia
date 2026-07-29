"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarClase, firmarClase } from "@/app/(dashboard)/libro-clases/firma/actions";
import { toast } from "@/components/ui/toast";

type FirmaBloque = {
  asignaturaId: string;
  asignaturaNombre: string;
  bloqueId: string;
  horaInicio: string;
  horaFin: string;
  estado: "pendiente" | "registrada" | "firmada";
  claseId: string | null;
  contenido: string;
  sugerido: boolean;
};

function FilaFirma({ b, fecha }: { b: FirmaBloque; fecha: string }) {
  const router = useRouter();
  const [contenido, setContenido] = useState(b.contenido);
  const [estado, setEstado] = useState(b.estado);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function registrar(firmar: boolean) {
    if (contenido.trim().length < 3) {
      setError("Describe los contenidos tratados.");
      return;
    }
    setOcupado(true);
    setError(null);
    setMsg(null);
    const res = await guardarClase({
      asignaturaId: b.asignaturaId,
      bloqueHorarioId: b.bloqueId,
      fecha,
      contenido: contenido.trim(),
      oaIds: [],
    });
    if (!res.ok) {
      setError(res.error);
      setOcupado(false);
      return;
    }
    if (firmar) {
      const f = await firmarClase(b.asignaturaId, res.id);
      if (!f.ok) {
        setError(f.error);
        setOcupado(false);
        return;
      }
      setEstado("firmada");
      setMsg("✓ Clase firmada");
      toast.exito(`Clase de ${b.asignaturaNombre} firmada.`);
    } else {
      setEstado("registrada");
      setMsg("Guardada sin firmar");
      toast.exito(`Clase de ${b.asignaturaNombre} guardada (sin firmar).`);
    }
    setOcupado(false);
    router.refresh();
  }

  if (estado === "firmada") {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-exito/25 bg-exito-suave px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-exito text-white" aria-hidden>✓</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-tinta">{b.asignaturaNombre}</p>
          <p className="text-xs text-exito">Clase firmada · {b.horaInicio}</p>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-borde bg-superficie p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-tinta">{b.asignaturaNombre}</p>
        <span className="text-xs tabular-nums text-tinta-tenue">{b.horaInicio}–{b.horaFin}</span>
      </div>
      {b.sugerido && contenido && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-marca-600">
          <span aria-hidden>✎</span> Sugerido desde tu planificación — revisa y edita
        </p>
      )}
      <textarea
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
        rows={2}
        placeholder="Contenidos tratados en la clase…"
        className="mt-2 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-200"
      />
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      {msg && <p className="mt-1 text-xs text-tinta-tenue">{msg}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => registrar(true)}
          disabled={ocupado}
          className="inline-flex items-center gap-1.5 rounded-xl bg-marca-600 px-4 py-2 text-sm font-semibold text-white hover:bg-marca-700 disabled:opacity-60"
        >
          {ocupado ? "Guardando…" : "Firmar clase"}
        </button>
        <button
          type="button"
          onClick={() => registrar(false)}
          disabled={ocupado}
          className="text-sm font-medium text-tinta-tenue hover:text-tinta disabled:opacity-60"
        >
          Solo guardar
        </button>
      </div>
    </li>
  );
}

/** Panel para firmar el leccionario del día sin salir de asistencia. */
export function FirmaRapida({ bloques, fecha }: { bloques: FirmaBloque[]; fecha: string }) {
  return (
    // pb en móvil: deja espacio para que la barra fija de asistencia no tape los botones.
    <section className="mx-auto mt-8 max-w-2xl pb-28 md:pb-0">
      <h2 className="font-display text-lg font-semibold tracking-tight">Firmar tu clase de hoy</h2>
      <p className="mt-0.5 text-sm text-tinta-suave">
        Registra y firma el leccionario del día en un paso. El contenido viene sugerido desde tu planificación.
      </p>
      <ul className="mt-3 space-y-2">
        {bloques.map((b) => (
          <FilaFirma key={b.bloqueId} b={b} fecha={fecha} />
        ))}
      </ul>
    </section>
  );
}
