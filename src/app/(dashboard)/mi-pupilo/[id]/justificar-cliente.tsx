"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { Insignia } from "@/components/ui/insignia";
import { toast } from "@/components/ui/toast";
import {
  PRESENTACION_ESTADO_JUSTIFICACION,
  type EstadoJustificacionVista,
} from "@/lib/justificaciones";
import { justificarInasistencia } from "./actions";
import { MOTIVOS_JUSTIFICACION } from "@/lib/justificaciones";

export type Inasistencia = {
  iso: string;
  fechaLarga: string;
  estado: EstadoJustificacionVista | null;
  motivo: string | null;
  fundamentoRevision: string | null;
};

export function Justificaciones({
  estudianteId,
  inasistencias,
}: {
  estudianteId: string;
  inasistencias: Inasistencia[];
}) {
  if (inasistencias.length === 0) {
    return (
      <p className="superficie mt-3 rounded-xl px-5 py-6 text-center text-sm text-tinta-suave">
        Sin inasistencias registradas. 🎉
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {inasistencias.map((i) => (
        <FilaInasistencia key={i.iso} estudianteId={estudianteId} inasistencia={i} />
      ))}
    </ul>
  );
}

function FilaInasistencia({
  estudianteId,
  inasistencia,
}: {
  estudianteId: string;
  inasistencia: Inasistencia;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<(typeof MOTIVOS_JUSTIFICACION)[number]>("Salud");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function enviar() {
    setError(null);
    startTransition(async () => {
      const r = await justificarInasistencia({
        estudianteId,
        fecha: inasistencia.iso,
        motivo,
        detalle: detalle || null,
      });
      if (r.ok) {
        setAbierto(false);
        toast.exito("Justificación enviada a Inspectoría.");
        router.refresh();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }

  return (
    <li className="superficie rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full bg-peligro" aria-hidden />
          <span className="font-medium capitalize text-tinta">{inasistencia.fechaLarga}</span>
        </span>
        {inasistencia.estado ? (
          <Insignia tono={PRESENTACION_ESTADO_JUSTIFICACION[inasistencia.estado].tono} punto>
            {PRESENTACION_ESTADO_JUSTIFICACION[inasistencia.estado].etiqueta}
          </Insignia>
        ) : abierto ? null : (
          <Boton type="button" variante="secundario" tamano="sm" className="min-h-11" onClick={() => setAbierto(true)}>
            Justificar
          </Boton>
        )}
      </div>

      {inasistencia.estado && (
        <div className="mt-3 border-t border-borde pt-3 text-sm">
          <p className="text-tinta-suave">
            {inasistencia.motivo ? `Motivo informado: ${inasistencia.motivo}. ` : ""}
            {PRESENTACION_ESTADO_JUSTIFICACION[inasistencia.estado].descripcion}
          </p>
          {inasistencia.fundamentoRevision && (
            <p className="mt-2 rounded-lg bg-superficie-2 p-3 text-tinta-suave">
              <span className="font-semibold text-tinta">Respuesta de Inspectoría:</span>{" "}
              {inasistencia.fundamentoRevision}
            </p>
          )}
          <p className="mt-2 text-xs text-tinta-tenue">La asistencia se mantiene registrada como ausente.</p>
        </div>
      )}

      {abierto && !inasistencia.estado && (
        <div className="mt-3 border-t border-borde pt-3">
          <p className="text-sm font-semibold text-tinta">Motivo de la inasistencia</p>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_JUSTIFICACION.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                aria-pressed={motivo === m}
                className={`min-h-11 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                  motivo === m
                    ? "border-marca-500 bg-marca-50 text-marca-700"
                    : "border-borde text-tinta-suave hover:bg-superficie-3"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <label htmlFor={`detalle-${inasistencia.iso}`} className="mt-3 block text-sm font-semibold text-tinta">
            Detalle opcional
          </label>
          <textarea
            id={`detalle-${inasistencia.iso}`}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="No incluyas diagnósticos ni información médica sensible."
            className="mt-1 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta outline-none focus:ring-2 focus:ring-marca-500/40"
          />
          <p className="mt-1 text-xs text-tinta-tenue">Inspectoría revisará los antecedentes. Esto no cambia el porcentaje de asistencia.</p>
          <div aria-live="polite">{error && <p className="mt-2 text-sm font-medium text-peligro">{error}</p>}</div>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
            <Boton type="button" onClick={enviar} disabled={pendiente} tamano="sm" className="min-h-11">
              {pendiente ? "Enviando…" : "Enviar justificación"}
            </Boton>
            <Boton
              type="button"
              variante="fantasma"
              tamano="sm"
              className="min-h-11"
              disabled={pendiente}
              onClick={() => {
                setAbierto(false);
                setError(null);
              }}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}
