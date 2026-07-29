"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { previsualizar, confirmar } from "./actions";
import { Boton } from "@/components/ui/boton";

type Tipo = "estudiantes" | "cursos";
type FilaVista = { fila: number; errores: string[]; valores: string[]; ok: boolean };
type Preview = {
  tipo: Tipo;
  columnas: string[];
  filas: FilaVista[];
  resumen: { total: number; validas: number; invalidas: number };
};

const TIPOS: { tipo: Tipo; etiqueta: string; ayuda: string }[] = [
  { tipo: "estudiantes", etiqueta: "Estudiantes", ayuda: "RUT, nombres, apellidos, fecha de nacimiento y, para matricular, nivel + letra (opcional)." },
  { tipo: "cursos", etiqueta: "Cursos", ayuda: "Nivel (1B–8B, 1M–4M, NT1, NT2) y letra." },
];

export function ImportadorCliente() {
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>("estudiantes");
  const [contenido, setContenido] = useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  function reset() {
    setContenido(null);
    setNombreArchivo("");
    setPreview(null);
    setError(null);
    setExito(null);
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setExito(null);
    setPreview(null);
    const texto = await file.text();
    setContenido(texto);
    setNombreArchivo(file.name);
  }

  async function onPrevisualizar() {
    if (!contenido) return;
    setOcupado(true);
    setError(null);
    const res = await previsualizar({ tipo, contenido });
    setOcupado(false);
    if (res.ok) setPreview({ tipo: res.tipo, columnas: res.columnas, filas: res.filas, resumen: res.resumen });
    else setError(res.error);
  }

  async function onConfirmar() {
    if (!contenido) return;
    setOcupado(true);
    setError(null);
    const res = await confirmar({ tipo, contenido });
    setOcupado(false);
    if (res.ok) {
      setExito(`Se importaron ${res.creadas} fila(s). ${res.omitidas > 0 ? `Se omitieron ${res.omitidas} con errores.` : ""}`);
      setPreview(null);
      setContenido(null);
      setNombreArchivo("");
      router.refresh();
    } else setError(res.error);
  }

  return (
    <div className="space-y-5">
      {/* Paso 1: tipo + plantilla + archivo */}
      <section className="rounded-xl border border-borde bg-superficie p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-marca-600 text-xs font-bold text-white">1</span>
          <h2 className="text-sm font-semibold text-tinta">Elige qué importar y sube el archivo</h2>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <button
              key={t.tipo}
              type="button"
              onClick={() => { setTipo(t.tipo); reset(); }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                tipo === t.tipo
                  ? "border-marca-500 bg-marca-50 text-marca-700"
                  : "border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
              }`}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-tinta-tenue">{TIPOS.find((t) => t.tipo === tipo)?.ayuda}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={`/api/plantilla/${tipo}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm font-medium text-tinta-suave transition-colors hover:text-tinta"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Descargar plantilla CSV
          </a>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-marca-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-marca-700">
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onArchivo} />
            {nombreArchivo || "Seleccionar archivo…"}
          </label>

          {contenido && (
            <button
              type="button"
              onClick={onPrevisualizar}
              disabled={ocupado}
              className="rounded-lg border border-marca-500 px-3 py-2 text-sm font-semibold text-marca-700 transition-colors hover:bg-marca-50 disabled:opacity-50"
            >
              {ocupado ? "Revisando…" : "Revisar archivo"}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
            {error}
          </p>
        )}
        {exito && (
          <p role="status" className="mt-3 rounded-lg border border-exito/20 bg-exito-suave px-3 py-2 text-sm text-exito">
            {exito}
          </p>
        )}
      </section>

      {/* Paso 2: previsualización */}
      {preview && (
        <section className="rounded-xl border border-borde bg-superficie p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-marca-600 text-xs font-bold text-white">2</span>
            <h2 className="text-sm font-semibold text-tinta">Revisa y confirma</h2>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-superficie-2 px-3 py-1.5 text-tinta-suave">Total: <strong className="text-tinta">{preview.resumen.total}</strong></span>
            <span className="rounded-lg bg-exito-suave px-3 py-1.5 text-exito">Válidas: <strong>{preview.resumen.validas}</strong></span>
            <span className={`rounded-lg px-3 py-1.5 ${preview.resumen.invalidas > 0 ? "bg-peligro-suave text-peligro" : "bg-superficie-2 text-tinta-tenue"}`}>
              Con errores: <strong>{preview.resumen.invalidas}</strong>
            </span>
          </div>

          <div className="mt-3 max-h-[380px] overflow-auto rounded-lg border border-borde">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-superficie-2">
                <tr>
                  <th className="px-3 py-2 font-semibold text-tinta-tenue">Fila</th>
                  <th className="px-3 py-2 font-semibold text-tinta-tenue">Estado</th>
                  {preview.columnas.map((c) => (
                    <th key={c} className="px-3 py-2 font-semibold text-tinta-tenue">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.filas.map((f) => (
                  <tr key={f.fila} className={`border-t border-borde ${f.ok ? "" : "bg-peligro-suave/40"}`}>
                    <td className="px-3 py-2 text-tinta-tenue">{f.fila}</td>
                    <td className="px-3 py-2">
                      {f.ok ? (
                        <span className="inline-flex items-center gap-1 text-exito">✓ Válida</span>
                      ) : (
                        <span className="text-peligro" title={f.errores.join(" ")}>✕ {f.errores.join(" ")}</span>
                      )}
                    </td>
                    {f.valores.map((v, i) => (
                      <td key={i} className="px-3 py-2 text-tinta">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Boton
              type="button"
              onClick={onConfirmar}
              disabled={ocupado || preview.resumen.validas === 0}
            >
              {ocupado ? "Importando…" : `Importar ${preview.resumen.validas} fila(s) válida(s)`}
            </Boton>
            <button type="button" onClick={reset} className="text-sm text-tinta-tenue hover:text-tinta">
              Cancelar
            </button>
          </div>
          {preview.resumen.invalidas > 0 && (
            <p className="mt-2 text-xs text-tinta-tenue">
              Las {preview.resumen.invalidas} fila(s) con errores no se importarán. Corrígelas en el archivo y vuelve a subirlo.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
