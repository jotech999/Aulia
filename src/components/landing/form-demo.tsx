"use client";

import { useState, useTransition } from "react";
import { solicitarDemo } from "@/app/acciones-demo";

const campo =
  "mt-1.5 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";

export function FormularioDemo() {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      nombre: String(fd.get("nombre") ?? ""),
      email: String(fd.get("email") ?? ""),
      colegio: String(fd.get("colegio") ?? ""),
      cargo: String(fd.get("cargo") ?? ""),
      telefono: String(fd.get("telefono") ?? ""),
      mensaje: String(fd.get("mensaje") ?? ""),
      sitio: String(fd.get("sitio") ?? ""),
    };
    startTransition(async () => {
      const res = await solicitarDemo(input);
      if (res.ok) setListo(true);
      else setError(res.error);
    });
  }

  if (listo) {
    return (
      <div className="rounded-2xl border border-exito/20 bg-exito-suave p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-exito text-lg font-bold text-white">✓</div>
        <p className="mt-3 font-display text-lg font-semibold text-tinta">¡Gracias! Te contactaremos pronto.</p>
        <p className="mt-1 text-sm text-tinta-suave">
          Recibimos tu solicitud. Un miembro del equipo te escribirá para coordinar una demostración.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-borde bg-superficie p-6 shadow-suave">
      {error && (
        <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2.5 text-sm text-peligro">
          {error}
        </p>
      )}
      {/* Honeypot */}
      <input type="text" name="sitio" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nombre" className="block text-sm font-medium text-tinta">Nombre</label>
          <input id="nombre" name="nombre" required maxLength={120} className={campo} placeholder="Tu nombre" />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-tinta">Email</label>
          <input id="email" name="email" type="email" required maxLength={160} className={campo} placeholder="tu@correo.cl" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="colegio" className="block text-sm font-medium text-tinta">Colegio <span className="text-tinta-tenue">(opcional)</span></label>
          <input id="colegio" name="colegio" maxLength={160} className={campo} placeholder="Nombre del establecimiento" />
        </div>
        <div>
          <label htmlFor="cargo" className="block text-sm font-medium text-tinta">Cargo <span className="text-tinta-tenue">(opcional)</span></label>
          <input id="cargo" name="cargo" maxLength={80} className={campo} placeholder="Director/a, UTP, profesor/a…" />
        </div>
      </div>
      <div>
        <label htmlFor="telefono" className="block text-sm font-medium text-tinta">Teléfono <span className="text-tinta-tenue">(opcional)</span></label>
        <input id="telefono" name="telefono" maxLength={40} className={campo} placeholder="+56 9 …" />
      </div>
      <div>
        <label htmlFor="mensaje" className="block text-sm font-medium text-tinta">Mensaje <span className="text-tinta-tenue">(opcional)</span></label>
        <textarea id="mensaje" name="mensaje" rows={3} maxLength={1000} className={campo} placeholder="Cuéntanos sobre tu colegio y qué buscas." />
      </div>
      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-lg bg-marca-600 px-4 py-3 text-sm font-semibold text-white shadow-suave transition-colors hover:bg-marca-700 disabled:opacity-60"
      >
        {pendiente ? "Enviando…" : "Solicitar demo"}
      </button>
      <p className="text-center text-xs text-tinta-tenue">
        Sin compromiso. Respondemos en horario hábil.
      </p>
    </form>
  );
}
