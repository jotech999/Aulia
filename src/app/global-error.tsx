"use client";

import { useEffect } from "react";

/**
 * Frontera de error GLOBAL (falla del layout raíz). Debe renderizar <html> y
 * <body> propios. Reporta al monitor interno y ofrece recargar.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
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
    <html lang="es-CL">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fff", color: "#0f172a" }}>
        <div style={{ maxWidth: 420, margin: "15vh auto 0", textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 40, margin: 0 }} aria-hidden>⚠️</p>
          <h1 style={{ fontSize: 20, marginTop: 12 }}>La aplicación tuvo un problema</h1>
          <p style={{ fontSize: 14, color: "#475569", marginTop: 8 }}>
            El error quedó registrado. Intenta recargar; si persiste, avisa a soporte
            {error.digest ? ` con el código ${error.digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              background: "#7442d2",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
