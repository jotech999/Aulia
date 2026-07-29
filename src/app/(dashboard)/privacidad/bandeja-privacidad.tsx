"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarSolicitudPrivacidad } from "./actions";
import { ETIQUETA_TIPO } from "@/lib/privacidad";
import { toast } from "@/components/ui/toast";

type Item = {
  id: string;
  tipo: keyof typeof ETIQUETA_TIPO;
  estado: string;
  descripcion: string;
  recibidaEn: string;
  vencimientoEn: string;
  titular: { nombre: string; email: string };
};

export function BandejaPrivacidad({ solicitudes }: { solicitudes: Item[] }) {
  const router = useRouter();
  const [activa, setActiva] = useState<string | null>(null);
  const [estado, setEstado] = useState<"VERIFICANDO_IDENTIDAD" | "EN_PROCESO" | "RESPONDIDA" | "RECHAZADA">("EN_PROCESO");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-tinta">Bandeja del colegio</h2>
          <p className="text-sm text-tinta-suave">Los datos de la persona solo aparecen al abrir el caso.</p>
        </div>
        <span className="rounded-full bg-superficie-3 px-3 py-1 text-xs font-semibold text-tinta-suave">{solicitudes.length} abiertas</span>
      </div>
      {solicitudes.length === 0 ? (
        <p className="mt-3 rounded-xl border border-borde bg-superficie p-5 text-sm text-tinta-suave">No hay solicitudes abiertas.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {solicitudes.map((solicitud) => (
            <li key={solicitud.id} className="superficie rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-tinta">{ETIQUETA_TIPO[solicitud.tipo]}</p>
                  <p className="text-xs text-tinta-tenue">Caso {solicitud.id.slice(-6).toUpperCase()} · vence {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(solicitud.vencimientoEn))}</p>
                </div>
                <span className="rounded-full bg-alerta-suave px-2.5 py-1 text-xs font-semibold text-alerta">{solicitud.estado.replaceAll("_", " ").toLowerCase()}</span>
                <button type="button" onClick={() => { setActiva(activa === solicitud.id ? null : solicitud.id); setEstado(solicitud.estado === "RECIBIDA" ? "VERIFICANDO_IDENTIDAD" : solicitud.estado === "VERIFICANDO_IDENTIDAD" ? "EN_PROCESO" : "RESPONDIDA"); }} className="min-h-10 rounded-lg border border-borde px-3 text-sm font-semibold text-tinta-suave">Gestionar</button>
              </div>
              {activa === solicitud.id && (
                <div className="mt-4 grid gap-3 border-t border-borde pt-4">
                  <div className="rounded-xl bg-superficie-2 p-3 text-sm">
                    <p className="font-semibold text-tinta">{solicitud.titular.nombre}</p>
                    <p className="text-xs text-tinta-tenue">{solicitud.titular.email}</p>
                    <p className="mt-2 whitespace-pre-wrap text-tinta-suave">{solicitud.descripcion}</p>
                  </div>
                  <select value={estado} onChange={(evento) => setEstado(evento.target.value as typeof estado)} className="min-h-11 rounded-xl border border-borde px-3 text-sm">
                    {solicitud.estado === "RECIBIDA" && <option value="VERIFICANDO_IDENTIDAD">Iniciar verificación de identidad</option>}
                    {solicitud.estado === "VERIFICANDO_IDENTIDAD" && <option value="EN_PROCESO">Identidad verificada · pasar a proceso</option>}
                    {solicitud.estado === "VERIFICANDO_IDENTIDAD" && <option value="RECHAZADA">Rechazar por identidad no verificada</option>}
                    {solicitud.estado === "EN_PROCESO" && <option value="RESPONDIDA">Responder y cerrar</option>}
                    {solicitud.estado === "EN_PROCESO" && <option value="RECHAZADA">Rechazar con fundamento</option>}
                  </select>
                  <textarea value={nota} onChange={(evento) => setNota(evento.target.value)} rows={3} maxLength={1200} placeholder="Fundamento o respuesta que verá la persona solicitante…" className="rounded-xl border border-borde p-3 text-sm" />
                  <button
                    type="button"
                    disabled={guardando || nota.trim().length < 10}
                    onClick={async () => {
                      setGuardando(true);
                      const resultado = await actualizarSolicitudPrivacidad({ solicitudId: solicitud.id, estado, nota });
                      setGuardando(false);
                      if (!resultado.ok) return toast.error(resultado.error);
                      toast.exito("Solicitud actualizada.");
                      setActiva(null);
                      setNota("");
                      router.refresh();
                    }}
                    className="min-h-11 justify-self-start rounded-xl bg-marca-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {guardando ? "Guardando…" : "Guardar estado"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
