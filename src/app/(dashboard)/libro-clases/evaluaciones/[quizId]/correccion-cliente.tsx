"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarResultado, vaciarANotas } from "../actions";
import { NOTA_APROBACION } from "@/lib/calificaciones";

type Alt = { id: string; texto: string; correcta: boolean };
type Pregunta = { id: string; tipo: "ALTERNATIVAS" | "VF" | "RESPUESTA_CORTA"; enunciado: string; puntaje: number; vfCorrecta: boolean | null; alternativas: Alt[] };
type Estudiante = { id: string; nombre: string };
type Res = { estudianteId: string; puntaje: number; puntajeMax: number; nota: number };

const campo = "mt-1 rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";

export function Correccion({
  quizId, preguntas, estudiantes, resultados, periodos, tituloSugerido,
}: {
  quizId: string; preguntas: Pregunta[]; estudiantes: Estudiante[]; resultados: Res[]; periodos: number[]; tituloSugerido: string;
}) {
  const router = useRouter();
  const [notas, setNotas] = useState<Map<string, number>>(new Map(resultados.map((r) => [r.estudianteId, r.nota])));
  const [estId, setEstId] = useState("");
  const [resp, setResp] = useState<Record<string, { alternativaId?: string; vf?: boolean; correctaManual?: boolean }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nombre, setNombre] = useState(tituloSugerido);
  const [ponderacion, setPonderacion] = useState(20);
  const [periodo, setPeriodo] = useState(periodos[0] ?? 1);

  const setR = (pid: string, v: { alternativaId?: string; vf?: boolean; correctaManual?: boolean }) =>
    setResp((r) => ({ ...r, [pid]: { ...r[pid], ...v } }));

  async function corregir() {
    if (!estId) return;
    setOcupado(true); setMsg(null);
    const respuestas = preguntas.map((p) => ({ preguntaId: p.id, ...resp[p.id] }));
    const res = await guardarResultado({ quizId, estudianteId: estId, respuestas });
    setOcupado(false);
    if (res.ok) {
      setNotas((m) => new Map(m).set(estId, res.nota));
      setMsg(`Nota ${res.nota.toFixed(1)} (${res.puntaje}/${res.puntajeMax} pts)`);
      setResp({}); setEstId("");
    } else setMsg(res.error);
  }

  async function vaciar() {
    setOcupado(true); setMsg(null);
    const res = await vaciarANotas({ quizId, nombre, ponderacion, periodo });
    setOcupado(false);
    if (res.ok) { setMsg(`Vaciado: ${res.n} nota(s) a calificaciones.`); router.refresh(); }
    else setMsg(res.error);
  }

  const corregidos = notas.size;

  return (
    <div className="mt-5 space-y-6">
      {msg && <p className="rounded-lg bg-superficie-2 px-3 py-2 text-sm text-tinta">{msg}</p>}

      {/* Corregir un estudiante */}
      <section className="superficie rounded-xl p-5">
        <h2 className="font-display text-base font-semibold tracking-tight">Corregir estudiante</h2>
        <select value={estId} onChange={(e) => { setEstId(e.target.value); setResp({}); }} className={`${campo} mt-2 w-full max-w-md`}>
          <option value="">Elige un estudiante…</option>
          {estudiantes.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}{notas.has(e.id) ? ` — ${notas.get(e.id)!.toFixed(1)}` : ""}</option>
          ))}
        </select>

        {estId && (
          <div className="mt-4 space-y-4">
            {preguntas.map((p, i) => (
              <div key={p.id} className="border-t border-borde pt-3">
                <p className="text-sm font-medium text-tinta">{i + 1}. {p.enunciado} <span className="text-xs text-tinta-tenue">({p.puntaje} pt)</span></p>
                {p.tipo === "ALTERNATIVAS" && (
                  <div className="mt-2 space-y-1">
                    {p.alternativas.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-sm">
                        <input type="radio" name={`p-${p.id}`} checked={resp[p.id]?.alternativaId === a.id} onChange={() => setR(p.id, { alternativaId: a.id })} />
                        {a.texto}
                      </label>
                    ))}
                  </div>
                )}
                {p.tipo === "VF" && (
                  <div className="mt-2 flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5"><input type="radio" name={`p-${p.id}`} checked={resp[p.id]?.vf === true} onChange={() => setR(p.id, { vf: true })} /> Verdadero</label>
                    <label className="flex items-center gap-1.5"><input type="radio" name={`p-${p.id}`} checked={resp[p.id]?.vf === false} onChange={() => setR(p.id, { vf: false })} /> Falso</label>
                  </div>
                )}
                {p.tipo === "RESPUESTA_CORTA" && (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={resp[p.id]?.correctaManual === true} onChange={(e) => setR(p.id, { correctaManual: e.target.checked })} />
                    Marcar como correcta
                  </label>
                )}
              </div>
            ))}
            <button type="button" onClick={corregir} disabled={ocupado} className="btn btn-primario">
              {ocupado ? "Corrigiendo…" : "Corregir y guardar nota"}
            </button>
          </div>
        )}
      </section>

      {/* Resultados + vaciado */}
      <section className="superficie rounded-xl p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base font-semibold tracking-tight">Resultados</h2>
          <span className="text-xs text-tinta-tenue">{corregidos} / {estudiantes.length} corregidos</span>
        </div>
        <ul className="mt-3 divide-y divide-borde/60 text-sm">
          {estudiantes.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-1.5">
              <span className="text-tinta">{e.nombre}</span>
              {notas.has(e.id) ? (
                <span className={`font-semibold tabular-nums ${notas.get(e.id)! < NOTA_APROBACION ? "text-peligro" : "text-exito"}`}>{notas.get(e.id)!.toFixed(1)}</span>
              ) : (
                <span className="text-xs text-tinta-tenue">Pendiente</span>
              )}
            </li>
          ))}
        </ul>

        {corregidos > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-borde pt-4">
            <label className="text-xs font-medium text-tinta-tenue">Nombre en el libro
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={`${campo} block`} />
            </label>
            <label className="text-xs font-medium text-tinta-tenue">Ponderación
              <input type="number" min={1} max={100} value={ponderacion} onChange={(e) => setPonderacion(Number(e.target.value))} className={`${campo} block w-24`} />
            </label>
            <label className="text-xs font-medium text-tinta-tenue">Semestre
              <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))} className={`${campo} block`}>
                {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <button type="button" onClick={vaciar} disabled={ocupado} className="btn btn-primario">
              Vaciar a calificaciones
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
