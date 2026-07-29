"use client";

import { useEffect } from "react";

/**
 * Frontera de error del dashboard: si cualquier página del panel falla,
 * la persona ve una pantalla amable con reintento, y el error se reporta
 * automáticamente al monitor interno (visible en los logs del servidor).
 */
export default function ErrorDashboard({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reporte best-effort al monitor interno (sin cookies ni datos personales).
    void fetch("/api/errores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensaje: error.message,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.pathname : "",
        stack: error.stack?.slice(0, 1500),
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-4xl" aria-hidden>⚠️</p>
      <h1 className="mt-3 font-display text-xl font-bold text-tinta">
        Algo salió mal en esta página
      </h1>
      <p className="mt-2 text-sm text-tinta-suave">
        El problema quedó registrado y lo revisaremos. Puedes reintentar o volver
        al inicio; tus datos guardados no se pierden.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primario">
          Reintentar
        </button>
        <a href="/dashboard" className="btn btn-secundario">
          Ir al inicio
        </a>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-tinta-tenue">Código de referencia: {error.digest}</p>
      )}
    </div>
  );
}
