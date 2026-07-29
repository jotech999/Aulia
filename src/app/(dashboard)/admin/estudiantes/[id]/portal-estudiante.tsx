"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { revocarPortalEstudiante, vincularPortalEstudiante } from "./actions";
import { toast } from "@/components/ui/toast";

export function PortalEstudiante({ estudianteId, correoActual, puedeGestionar }: { estudianteId: string; correoActual: string | null; puedeGestionar: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  if (!puedeGestionar) return null;

  if (correoActual) {
    return <section className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-exito/20 bg-exito-suave p-4 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold text-exito">Portal estudiantil activo</p><p className="truncate text-xs text-tinta-suave">{correoActual}</p></div><button type="button" disabled={ocupado} onClick={async () => { setOcupado(true); const resultado = await revocarPortalEstudiante(estudianteId); setOcupado(false); if (!resultado.ok) return toast.error(resultado.error); toast.exito("Acceso revocado inmediatamente."); router.refresh(); }} className="min-h-10 rounded-lg border border-peligro/25 bg-superficie px-3 font-semibold text-peligro disabled:opacity-50">{ocupado ? "Revocando…" : "Revocar acceso"}</button></section>;
  }

  return <section className="mt-4 rounded-xl border border-borde bg-superficie p-4"><p className="font-semibold text-tinta">Invitar al portal estudiantil</p><p className="mt-1 text-xs leading-5 text-tinta-suave">El acceso permanecerá inactivo. La persona recibirá un enlace personal, de un solo uso y válido por 24 horas.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input type="email" value={email} onChange={(evento) => setEmail(evento.target.value)} placeholder="cuenta existente" autoComplete="off" className="min-h-11 flex-1 rounded-xl border border-borde px-3 text-sm"/><button type="button" disabled={ocupado || !email.trim()} onClick={async () => { setOcupado(true); const resultado = await vincularPortalEstudiante({ estudianteId, email }); setOcupado(false); if (!resultado.ok) return toast.error(resultado.error); setEmail(""); toast.exito(resultado.mensaje); router.refresh(); }} className="min-h-11 rounded-xl bg-marca-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{ocupado ? "Enviando…" : "Enviar invitación segura"}</button></div></section>;
}
