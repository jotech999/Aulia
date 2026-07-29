"use client";

/**
 * Botón "Imprimir": abre el diálogo de impresión del navegador (que permite
 * guardar como PDF). Se oculta al imprimir (data-noprint). El estilo imprimible
 * vive en globals.css (@media print): oculta menú/barras y deja solo el contenido.
 */
export function BotonImprimir({ children = "Imprimir" }: { children?: React.ReactNode }) {
  return (
    <button
      type="button"
      data-noprint
      onClick={() => window.print()}
      className="btn btn-secundario btn-sm"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v7H6z" />
      </svg>
      {children}
    </button>
  );
}
