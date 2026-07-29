"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enviarMensaje, marcarHiloLeido } from "./acciones";

export type MensajeVista = {
  id: string;
  deApoderado: boolean;
  cuerpo: string;
  creadoEn: string; // ISO
};

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Hilo de mensajes directos sobre un estudiante. Lo usan el apoderado (en el
 * portal de su pupilo) y el profesor jefe (en la ficha). `soyApoderado` alinea
 * "mis" mensajes a la derecha. Marca leídos al abrir.
 */
export function HiloMensajes({
  estudianteId,
  soyApoderado,
  contraparte,
  mensajes,
}: {
  estudianteId: string;
  soyApoderado: boolean;
  contraparte: string;
  mensajes: MensajeVista[];
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);

  // Marca como leídos los mensajes de la contraparte al abrir el hilo.
  useEffect(() => {
    marcarHiloLeido(estudianteId).catch(() => {});
  }, [estudianteId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest" });
  }, [mensajes.length]);

  function enviar() {
    if (texto.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const r = await enviarMensaje({ estudianteId, cuerpo: texto });
      if (r.ok) {
        setTexto("");
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
      <div className="max-h-80 space-y-2 overflow-y-auto p-4">
        {mensajes.length === 0 ? (
          <p className="py-6 text-center text-sm text-tinta-tenue">
            No hay mensajes. Escribe el primero a {contraparte}.
          </p>
        ) : (
          mensajes.map((m) => {
            const mio = m.deApoderado === soyApoderado;
            return (
              <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    mio
                      ? "bg-marca-600 text-white"
                      : "bg-superficie-2 text-tinta"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.cuerpo}</p>
                  <p className={`mt-1 text-[10px] ${mio ? "text-white/70" : "text-tinta-tenue"}`}>
                    {hora(m.creadoEn)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={finRef} />
      </div>

      <div className="border-t border-borde p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={2}
          placeholder={`Escribe a ${contraparte}… (⌘+Enter para enviar)`}
          className="w-full resize-none rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-marca-500/40"
        />
        {error && <p className="mt-1 text-sm text-peligro">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={enviar}
            disabled={pendiente || texto.trim().length === 0}
            className="btn btn-primario btn-sm"
          >
            {pendiente ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
