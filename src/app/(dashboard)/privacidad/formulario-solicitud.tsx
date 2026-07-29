"use client";

import { useState } from "react";
import { crearSolicitudPrivacidad } from "./actions";
import { ETIQUETA_TIPO, TIPOS_SOLICITUD } from "@/lib/privacidad";
import { Boton } from "@/components/ui/boton";
import { toast } from "@/components/ui/toast";

export function FormularioSolicitud() {
  const [tipo, setTipo] = useState<(typeof TIPOS_SOLICITUD)[number]>("ACCESO");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    const resultado = await crearSolicitudPrivacidad({ tipo, descripcion });
    setEnviando(false);
    if (!resultado.ok) return toast.error(resultado.error);
    setDescripcion("");
    toast.exito("Solicitud recibida. Puedes seguir su estado aquí.");
  }

  return (
    <section className="superficie rounded-2xl p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-tinta">Nueva solicitud</h2>
      <p className="mt-1 text-sm text-tinta-suave">Describe solo lo necesario; no incluyas información de salud ni documentos sensibles.</p>
      <div className="mt-4 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium text-tinta">
          Derecho que quieres ejercer
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="min-h-11 rounded-xl border border-borde bg-superficie px-3 outline-none focus:ring-2 focus:ring-marca-500/30">
            {TIPOS_SOLICITUD.map((item) => <option key={item} value={item}>{ETIQUETA_TIPO[item]}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-tinta">
          Detalle
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} maxLength={1200} placeholder="Indica qué información necesitas revisar o corregir…" className="rounded-xl border border-borde bg-superficie px-3 py-2 outline-none focus:ring-2 focus:ring-marca-500/30" />
          <span className="text-right text-xs text-tinta-tenue">{descripcion.length}/1200</span>
        </label>
        <div><Boton type="button" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Enviar solicitud"}</Boton></div>
      </div>
    </section>
  );
}
