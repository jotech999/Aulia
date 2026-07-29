"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarFichaPie, agregarSesionPie } from "../actions";

const campo =
  "mt-1.5 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";

export function FormularioFicha({
  estudianteId,
  inicial,
  existe,
}: {
  estudianteId: string;
  inicial: { diagnostico: string; apoyos: string; profesionalACargo: string };
  existe: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const fd = new FormData(e.currentTarget);
    const input = {
      estudianteId,
      diagnostico: String(fd.get("diagnostico") ?? ""),
      apoyos: String(fd.get("apoyos") ?? ""),
      profesionalACargo: String(fd.get("profesionalACargo") ?? ""),
    };
    startTransition(async () => {
      const res = await guardarFichaPie(input);
      if (res.ok) {
        setOk(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="superficie space-y-4 rounded-xl p-5">
      <p className="font-display text-base font-semibold text-tinta">
        {existe ? "Ficha de apoyo" : "Crear ficha de apoyo"}
      </p>

      {error && (
        <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded-lg border border-exito/20 bg-exito-suave px-3 py-2 text-sm text-exito">
          Guardado.
        </p>
      )}

      <div>
        <label htmlFor="diagnostico" className="block text-sm font-medium">
          Diagnóstico <span className="text-tinta-tenue">(se guarda cifrado)</span>
        </label>
        <textarea id="diagnostico" name="diagnostico" required rows={4} maxLength={5000} defaultValue={inicial.diagnostico} className={campo} />
      </div>
      <div>
        <label htmlFor="apoyos" className="block text-sm font-medium">Apoyos y adecuaciones</label>
        <textarea id="apoyos" name="apoyos" rows={3} maxLength={5000} defaultValue={inicial.apoyos} className={campo} />
      </div>
      <div>
        <label htmlFor="profesionalACargo" className="block text-sm font-medium">Profesional a cargo</label>
        <input id="profesionalACargo" name="profesionalACargo" maxLength={200} defaultValue={inicial.profesionalACargo} className={campo} placeholder="Nombre y rol" />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={pendiente} className="btn btn-primario">
          {pendiente ? "Guardando…" : existe ? "Guardar cambios" : "Crear ficha"}
        </button>
      </div>
    </form>
  );
}

export function FormularioSesion({ estudianteId }: { estudianteId: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      estudianteId,
      fecha: String(fd.get("fecha") ?? ""),
      asistio: fd.get("asistio") === "on",
      observacion: String(fd.get("observacion") ?? ""),
    };
    startTransition(async () => {
      const res = await agregarSesionPie(input);
      if (res.ok) {
        form.reset();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="superficie space-y-3 rounded-xl p-4">
      {error && (
        <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="fecha" className="block text-xs font-medium text-tinta-suave">Fecha</label>
          <input id="fecha" name="fecha" type="date" required className={`${campo} !mt-1`} />
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" name="asistio" defaultChecked className="h-4 w-4 rounded border-borde-fuerte accent-marca-600" />
          Asistió
        </label>
      </div>
      <div>
        <label htmlFor="observacion" className="block text-xs font-medium text-tinta-suave">Observación de la sesión</label>
        <textarea id="observacion" name="observacion" rows={2} maxLength={3000} className={`${campo} !mt-1`} />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={pendiente} className="btn btn-primario btn-sm">
          {pendiente ? "Guardando…" : "Registrar sesión"}
        </button>
      </div>
    </form>
  );
}
