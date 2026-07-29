"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Boton } from "@/components/ui/boton";
import { Insignia } from "@/components/ui/insignia";
import { toast } from "@/components/ui/toast";
import {
  PRESENTACION_ESTADO_JUSTIFICACION,
  type EstadoJustificacionVista,
} from "@/lib/justificaciones";
import { revisarJustificacion } from "./actions";

export type JustificacionBandeja = {
  id: string;
  fecha: string;
  motivo: string;
  detalle: string | null;
  estado: EstadoJustificacionVista;
  creadaEn: string;
  revisadaEn: string | null;
  fundamentoRevision: string | null;
  estudiante: { id: string; nombre: string; curso: string | null };
};

export function BandejaJustificaciones({ justificaciones }: { justificaciones: JustificacionBandeja[] }) {
  return (
    <ul className="mt-5 grid gap-3 lg:grid-cols-2" aria-label="Justificaciones de inasistencia">
      {justificaciones.map((justificacion) => (
        <TarjetaJustificacion key={justificacion.id} justificacion={justificacion} />
      ))}
    </ul>
  );
}

function TarjetaJustificacion({ justificacion }: { justificacion: JustificacionBandeja }) {
  const router = useRouter();
  const [rechazando, setRechazando] = useState(false);
  const [fundamento, setFundamento] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciarTransicion] = useTransition();
  const presentacion = PRESENTACION_ESTADO_JUSTIFICACION[justificacion.estado];

  function resolver(decision: "APROBADA" | "RECHAZADA") {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await revisarJustificacion({
        justificacionId: justificacion.id,
        decision,
        fundamento: decision === "RECHAZADA" ? fundamento : null,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        toast.error(resultado.error);
        return;
      }
      toast.exito(decision === "APROBADA" ? "Justificación aprobada." : "Justificación rechazada.");
      router.refresh();
    });
  }

  return (
    <li className="superficie flex min-w-0 flex-col rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/estudiantes/${justificacion.estudiante.id}`}
            className="font-display text-base font-semibold text-tinta hover:text-marca-700"
          >
            {justificacion.estudiante.nombre}
          </Link>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            {justificacion.estudiante.curso ?? "Sin curso activo"} · Inasistencia del {formatearDia(justificacion.fecha)}
          </p>
        </div>
        <Insignia tono={presentacion.tono} punto>
          {presentacion.etiqueta}
        </Insignia>
      </div>

      <div className="mt-4 rounded-lg bg-superficie-2 p-3">
        <p className="text-sm font-semibold text-tinta">{justificacion.motivo}</p>
        {justificacion.detalle ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-tinta-suave">{justificacion.detalle}</p>
        ) : (
          <p className="mt-1 text-sm text-tinta-tenue">Sin detalle adicional.</p>
        )}
        <p className="mt-2 text-xs text-tinta-tenue">Enviada {formatearInstante(justificacion.creadaEn)}</p>
      </div>

      {justificacion.estado === "PENDIENTE" ? (
        <div className="mt-auto pt-4">
          <p className="mb-3 text-xs text-tinta-tenue">
            La revisión queda registrada. La asistencia seguirá figurando como ausente.
          </p>
          {!rechazando ? (
            <div className="grid grid-cols-2 gap-2">
              <Boton
                type="button"
                tamano="sm"
                className="min-h-11"
                disabled={guardando}
                onClick={() => resolver("APROBADA")}
              >
                {guardando ? "Guardando…" : "Aprobar"}
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                tamano="sm"
                className="min-h-11"
                disabled={guardando}
                onClick={() => setRechazando(true)}
              >
                Rechazar
              </Boton>
            </div>
          ) : (
            <div className="rounded-lg border border-borde bg-superficie p-3">
              <label htmlFor={`fundamento-${justificacion.id}`} className="text-sm font-semibold text-tinta">
                Motivo del rechazo
              </label>
              <p className="mt-0.5 text-xs text-tinta-tenue">La familia verá esta explicación. No incluyas datos médicos.</p>
              <textarea
                id={`fundamento-${justificacion.id}`}
                value={fundamento}
                onChange={(evento) => setFundamento(evento.target.value)}
                rows={3}
                maxLength={500}
                disabled={guardando}
                autoFocus
                className="mt-2 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta outline-none focus:ring-2 focus:ring-marca-500/40"
              />
              <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Boton
                  type="button"
                  variante="fantasma"
                  tamano="sm"
                  className="min-h-11"
                  disabled={guardando}
                  onClick={() => {
                    setRechazando(false);
                    setError(null);
                  }}
                >
                  Cancelar
                </Boton>
                <Boton
                  type="button"
                  variante="peligro"
                  tamano="sm"
                  className="min-h-11"
                  disabled={guardando}
                  onClick={() => resolver("RECHAZADA")}
                >
                  {guardando ? "Guardando…" : "Confirmar rechazo"}
                </Boton>
              </div>
            </div>
          )}
          <div aria-live="polite">
            {error && <p className="mt-2 text-sm font-medium text-peligro">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-borde pt-3">
          <p className="text-xs font-medium text-tinta-tenue">
            {justificacion.revisadaEn ? `Revisada ${formatearInstante(justificacion.revisadaEn)}` : presentacion.descripcion}
          </p>
          {justificacion.fundamentoRevision && (
            <p className="mt-1 text-sm text-tinta-suave">{justificacion.fundamentoRevision}</p>
          )}
        </div>
      )}
    </li>
  );
}

function formatearDia(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function formatearInstante(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
