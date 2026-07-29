"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearPregunta, eliminarPregunta, crearQuiz } from "./actions";
import { toast } from "@/components/ui/toast";
import { confirmar } from "@/components/ui/confirmar";

type Alt = { id: string; texto: string; correcta: boolean };
type Pregunta = {
  id: string;
  tipo: "ALTERNATIVAS" | "VF" | "RESPUESTA_CORTA";
  enunciado: string;
  oaCodigo: string | null;
  puntaje: number;
  vfCorrecta: boolean | null;
  alternativas: Alt[];
};

const campo = "mt-1 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";
const ETIQUETA_TIPO = { ALTERNATIVAS: "Alternativas", VF: "Verdadero / Falso", RESPUESTA_CORTA: "Respuesta corta" } as const;

export function Banco({ asignaturaId, preguntas }: { asignaturaId: string; preguntas: Pregunta[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"ALTERNATIVAS" | "VF" | "RESPUESTA_CORTA">("ALTERNATIVAS");
  const [enunciado, setEnunciado] = useState("");
  const [oaCodigo, setOaCodigo] = useState("");
  const [puntaje, setPuntaje] = useState(1);
  const [alts, setAlts] = useState<{ texto: string; correcta: boolean }[]>([
    { texto: "", correcta: true },
    { texto: "", correcta: false },
  ]);
  const [vf, setVf] = useState(true);
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [titulo, setTitulo] = useState("");

  async function agregarPregunta(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    const input = {
      asignaturaId, tipo, enunciado, oaCodigo, puntaje,
      alternativas: tipo === "ALTERNATIVAS" ? alts.filter((a) => a.texto.trim()) : undefined,
      vfCorrecta: tipo === "VF" ? vf : undefined,
      respuestaEsperada: tipo === "RESPUESTA_CORTA" ? respuesta : undefined,
    };
    const res = await crearPregunta(input);
    setOcupado(false);
    if (res.ok) {
      setEnunciado(""); setOaCodigo(""); setPuntaje(1); setRespuesta("");
      setAlts([{ texto: "", correcta: true }, { texto: "", correcta: false }]);
      router.refresh();
    } else setError(res.error);
  }

  async function borrar(id: string) {
    const ok = await confirmar({
      titulo: "¿Eliminar esta pregunta del banco?",
      textoConfirmar: "Eliminar",
      peligro: true,
    });
    if (!ok) return;
    const res = await eliminarPregunta(id);
    if (res.ok) {
      toast.exito("Pregunta eliminada.");
      router.refresh();
    } else toast.error(res.error);
  }

  async function armarQuiz(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    const res = await crearQuiz({ asignaturaId, titulo, preguntaIds: [...sel] });
    setOcupado(false);
    if (res.ok) { setTitulo(""); setSel(new Set()); router.push(`/libro-clases/evaluaciones/${res.id}`); }
    else setError(res.error);
  }

  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold tracking-tight">Banco de preguntas</h2>

      {/* Formulario de nueva pregunta */}
      <form onSubmit={agregarPregunta} className="superficie mt-3 space-y-3 rounded-xl p-5">
        {error && <p className="rounded-lg bg-peligro-suave px-3 py-2 text-sm text-peligro">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-medium text-tinta-tenue">
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={campo}>
              <option value="ALTERNATIVAS">Alternativas</option>
              <option value="VF">Verdadero / Falso</option>
              <option value="RESPUESTA_CORTA">Respuesta corta</option>
            </select>
          </label>
          <label className="text-xs font-medium text-tinta-tenue">
            Puntaje
            <input type="number" min={1} max={100} value={puntaje} onChange={(e) => setPuntaje(Number(e.target.value))} className={`${campo} w-24`} />
          </label>
          <label className="flex-1 text-xs font-medium text-tinta-tenue">
            OA (opcional)
            <input value={oaCodigo} onChange={(e) => setOaCodigo(e.target.value)} placeholder="MA05 OA 07" className={campo} />
          </label>
        </div>
        <label className="block text-xs font-medium text-tinta-tenue">
          Enunciado
          <textarea value={enunciado} onChange={(e) => setEnunciado(e.target.value)} required rows={2} className={campo} placeholder="Escribe la pregunta…" />
        </label>

        {tipo === "ALTERNATIVAS" && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-tinta-tenue">Alternativas (marca la correcta)</p>
            {alts.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correcta" checked={a.correcta} onChange={() => setAlts((xs) => xs.map((x, j) => ({ ...x, correcta: j === i })))} />
                <input value={a.texto} onChange={(e) => setAlts((xs) => xs.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} placeholder={`Alternativa ${i + 1}`} className={`${campo} mt-0 flex-1`} />
                {alts.length > 2 && <button type="button" onClick={() => setAlts((xs) => xs.filter((_, j) => j !== i))} className="text-tinta-tenue hover:text-peligro">✕</button>}
              </div>
            ))}
            {alts.length < 6 && <button type="button" onClick={() => setAlts((xs) => [...xs, { texto: "", correcta: false }])} className="text-xs font-medium text-marca-600">+ Agregar alternativa</button>}
          </div>
        )}
        {tipo === "VF" && (
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={vf} onChange={() => setVf(true)} /> Verdadero</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={!vf} onChange={() => setVf(false)} /> Falso</label>
          </div>
        )}
        {tipo === "RESPUESTA_CORTA" && (
          <label className="block text-xs font-medium text-tinta-tenue">
            Respuesta esperada (referencia; se corrige a mano)
            <input value={respuesta} onChange={(e) => setRespuesta(e.target.value)} className={campo} />
          </label>
        )}

        <button type="submit" disabled={ocupado} className="btn btn-primario">
          {ocupado ? "Guardando…" : "Agregar al banco"}
        </button>
      </form>

      {/* Lista de preguntas + armado de quiz */}
      {preguntas.length > 0 && (
        <>
          <form onSubmit={armarQuiz} className="superficie mt-4 flex flex-wrap items-end gap-3 rounded-xl p-4">
            <label className="flex-1 text-xs font-medium text-tinta-tenue">
              Título del quiz
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Quiz unidad 1" className={campo} />
            </label>
            <button type="submit" disabled={ocupado || sel.size === 0 || titulo.trim().length < 3} className="btn btn-primario">
              Crear quiz con {sel.size} seleccionada(s)
            </button>
          </form>

          <ul className="mt-3 space-y-2">
            {preguntas.map((p) => (
              <li key={p.id} className="superficie flex items-start gap-3 rounded-xl p-4">
                <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-superficie-3 px-1.5 py-0.5 text-[11px] font-semibold text-tinta-tenue">{ETIQUETA_TIPO[p.tipo]}</span>
                    <span className="text-[11px] text-tinta-tenue">{p.puntaje} pt{p.oaCodigo ? ` · ${p.oaCodigo}` : ""}</span>
                  </div>
                  <p className="mt-1 text-sm text-tinta">{p.enunciado}</p>
                  {p.tipo === "ALTERNATIVAS" && (
                    <ul className="mt-1 space-y-0.5 text-xs text-tinta-suave">
                      {p.alternativas.map((a) => (
                        <li key={a.id} className={a.correcta ? "font-semibold text-exito" : ""}>{a.correcta ? "✓ " : "• "}{a.texto}</li>
                      ))}
                    </ul>
                  )}
                  {p.tipo === "VF" && <p className="mt-1 text-xs font-semibold text-exito">Correcta: {p.vfCorrecta ? "Verdadero" : "Falso"}</p>}
                </div>
                <button type="button" onClick={() => borrar(p.id)} className="text-tinta-tenue hover:text-peligro" aria-label="Eliminar">✕</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
