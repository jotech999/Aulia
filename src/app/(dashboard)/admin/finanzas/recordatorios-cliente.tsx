"use client";

import { useState } from "react";
import { enviarRecordatoriosCuotas } from "./actions";

/**
 * Botón de cobranza amable: envía a los apoderados el recordatorio de sus
 * cuotas vencidas (campana + push + email), máximo uno por cuota a la semana.
 */
export function RecordatoriosCuotas() {
  const [estado, setEstado] = useState<"inactivo" | "enviando" | "listo" | "error">("inactivo");
  const [detalle, setDetalle] = useState<string | null>(null);

  async function enviar() {
    if (estado === "enviando") return;
    setEstado("enviando");
    setDetalle(null);
    const res = await enviarRecordatoriosCuotas();
    if (res.ok) {
      setEstado("listo");
      setDetalle(
        res.enviados === 0
          ? "No hay cuotas vencidas sin recordatorio reciente. Todo al día."
          : `${res.enviados} recordatorio(s) enviados a los apoderados.`
      );
    } else {
      setEstado("error");
      setDetalle(res.error);
    }
  }

  return (
    <div className="superficie mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-tinta">Recordatorios de cuotas vencidas</p>
        <p className="mt-0.5 text-xs text-tinta-tenue">
          Avisa por campana, push y correo a los apoderados con cuotas vencidas, con enlace
          para pagar en línea. Anti-spam: máximo un aviso por cuota a la semana. Sin montos
          en el correo (se ven en el portal).
        </p>
        {detalle && (
          <p
            className={`mt-1.5 text-xs font-medium ${
              estado === "error" ? "text-peligro" : "text-exito"
            }`}
            role="status"
          >
            {detalle}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={enviar}
        disabled={estado === "enviando"}
        className="btn btn-primario shrink-0"
      >
        {estado === "enviando" ? "Enviando…" : "Enviar recordatorios"}
      </button>
    </div>
  );
}
