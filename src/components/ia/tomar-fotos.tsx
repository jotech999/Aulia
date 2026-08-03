"use client";

import { useRef, useState } from "react";
import { comprimirImagen, type ImagenComprimida } from "@/lib/imagenes";

/**
 * TOMAR FOTOS de una hoja, para las funciones que leen papel.
 *
 * Usa `<input type="file" capture="environment">` y no la API de cámara: así
 * se abre la cámara nativa del teléfono —que enfoca y encuadra mejor que
 * cualquier cosa que hagamos nosotros— y además funciona con la política de
 * permisos del sitio, que tiene `camera=()` deshabilitada a propósito. En el
 * computador, el mismo botón abre el explorador de archivos.
 *
 * Las fotos se comprimen en el dispositivo antes de salir (ver `lib/imagenes`).
 */
export function TomarFotos({
  fotos,
  onCambio,
  maximo = 4,
  etiqueta = "Agregar foto",
  deshabilitado = false,
}: {
  fotos: ImagenComprimida[];
  onCambio: (fotos: ImagenComprimida[]) => void;
  maximo?: number;
  etiqueta?: string;
  deshabilitado?: boolean;
}) {
  const entradaRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function agregar(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setError(null);
    setProcesando(true);
    try {
      const espacio = maximo - fotos.length;
      const archivos = Array.from(lista).slice(0, Math.max(espacio, 0));
      if (archivos.length === 0) {
        setError(`Ya tienes el máximo de ${maximo} fotos.`);
        return;
      }
      const nuevas: ImagenComprimida[] = [];
      for (const archivo of archivos) {
        nuevas.push(await comprimirImagen(archivo));
      }
      onCambio([...fotos, ...nuevas]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la foto.");
    } finally {
      setProcesando(false);
      // Permite volver a elegir el mismo archivo si hizo falta reintentar.
      if (entradaRef.current) entradaRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={entradaRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => void agregar(e.target.files)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => entradaRef.current?.click()}
          disabled={deshabilitado || procesando || fotos.length >= maximo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm font-semibold text-tinta-suave transition-colors hover:bg-superficie-2 disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          {procesando ? "Preparando…" : etiqueta}
        </button>
        {fotos.length > 0 && (
          <span className="text-xs text-tinta-tenue">
            {fotos.length} de {maximo}
          </span>
        )}
      </div>

      {error && <p className="mt-1.5 text-xs text-peligro">{error}</p>}

      {fotos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {fotos.map((f, i) => (
            <li key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.urlPrevia}
                alt={`Foto ${i + 1}`}
                className="h-20 w-16 rounded-lg border border-borde object-cover"
              />
              <button
                type="button"
                onClick={() => onCambio(fotos.filter((_, j) => j !== i))}
                aria-label={`Quitar la foto ${i + 1}`}
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-borde bg-superficie text-xs text-tinta-suave shadow-suave hover:text-peligro"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-xs leading-relaxed text-tinta-tenue">
        Las fotos se procesan y se descartan: no quedan guardadas en la plataforma.
      </p>
    </div>
  );
}
