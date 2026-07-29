"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarPostulacion } from "./actions";

type Estado = "RECIBIDA" | "EN_REVISION" | "ACEPTADA" | "RECHAZADA" | "MATRICULADA";

/** Botonera de gestión de una postulación (cambia estado + refresca). */
export function AccionesPostulacion({ id, estado }: { id: string; estado: Estado }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(nuevo: Exclude<Estado, "RECIBIDA">) {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    const res = await actualizarPostulacion({ id, estado: nuevo });
    setOcupado(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {estado === "RECIBIDA" && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => cambiar("EN_REVISION")}
          className="rounded-lg border border-borde px-2.5 py-1 text-xs font-medium text-tinta-suave transition-colors hover:border-marca-500 hover:text-marca-600"
        >
          Pasar a revisión
        </button>
      )}
      {(estado === "RECIBIDA" || estado === "EN_REVISION") && (
        <>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => cambiar("ACEPTADA")}
            className="rounded-lg bg-exito-suave px-2.5 py-1 text-xs font-semibold text-exito transition-colors hover:brightness-95"
          >
            Aceptar
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => cambiar("RECHAZADA")}
            className="rounded-lg bg-peligro-suave px-2.5 py-1 text-xs font-semibold text-peligro transition-colors hover:brightness-95"
          >
            Rechazar
          </button>
        </>
      )}
      {estado === "ACEPTADA" && (
        <>
          <a
            href={`/admin/matricular?postulacionId=${id}`}
            className="rounded-lg bg-marca-50 px-2.5 py-1 text-xs font-semibold text-marca-700 transition-colors hover:bg-marca-100"
          >
            Matricular →
          </a>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => cambiar("MATRICULADA")}
            className="rounded-lg border border-borde px-2.5 py-1 text-xs font-medium text-tinta-suave transition-colors hover:border-exito hover:text-exito"
          >
            Marcar matriculada
          </button>
        </>
      )}
      {error && <span className="text-xs text-peligro">{error}</span>}
    </div>
  );
}

/** Botón que copia el enlace público de postulación del colegio. */
export function CopiarEnlacePublico({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          /* clipboard no disponible */
        }
      }}
      className="btn btn-secundario"
    >
      {copiado ? "¡Enlace copiado!" : "Copiar enlace público"}
    </button>
  );
}
