"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearVersionHorario, publicarVersionHorario } from "./actions";
import { toast } from "@/components/ui/toast";

export function VersionesHorario({ cursoId, versionId, esBorrador, fechaSugerida }: { cursoId: string; versionId: string | null; esBorrador: boolean; fechaSugerida: string }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(fechaSugerida);
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (esBorrador && versionId) return <div className="flex flex-wrap gap-2"><button type="button" onClick={() => iniciar(async () => { const res = await publicarVersionHorario(versionId); if (!res.ok) { toast.error(res.error); return; } toast.exito("Nueva versión publicada con su vigencia."); router.push(`/libro-clases/horario?cursoId=${cursoId}`); router.refresh(); })} disabled={pendiente} className="min-h-11 rounded-xl bg-marca-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{pendiente ? "Publicando…" : "Publicar versión"}</button><button type="button" onClick={() => router.push(`/libro-clases/horario?cursoId=${cursoId}&versionId=${versionId}`)} className="min-h-11 rounded-xl border border-borde px-3 text-sm font-semibold text-tinta-suave">Vista previa</button></div>;
  return <div className="relative">{abierto ? <div className="flex flex-wrap items-end gap-2 rounded-xl border border-borde bg-superficie p-3 shadow-elevada"><label className="grid gap-1 text-xs font-semibold text-tinta-tenue">Vigente desde<input type="date" value={fecha} min={fechaSugerida} onChange={(e) => setFecha(e.target.value)} className="min-h-10 rounded-lg border border-borde px-2 text-sm text-tinta" /></label><button type="button" disabled={pendiente} onClick={() => iniciar(async () => { const res = await crearVersionHorario({ cursoId, vigenteDesde: fecha }); if (!res.ok) { toast.error(res.error); return; } toast.exito("Borrador creado desde el horario actual."); router.push(`/libro-clases/horario?cursoId=${cursoId}&versionId=${res.versionId}&editar=1`); router.refresh(); })} className="min-h-10 rounded-lg bg-marca-600 px-3 text-sm font-semibold text-white disabled:opacity-60">{pendiente ? "Creando…" : "Crear borrador"}</button><button type="button" onClick={() => setAbierto(false)} className="min-h-10 px-2 text-sm text-tinta-tenue">Cancelar</button></div> : <button type="button" onClick={() => setAbierto(true)} className="min-h-11 rounded-xl bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">Crear nueva versión</button>}</div>;
}
