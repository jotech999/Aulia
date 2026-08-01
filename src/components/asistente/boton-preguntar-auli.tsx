"use client";

/**
 * Botón pequeño que abre a Auli con una pregunta ya lista (evento global que
 * escucha el asistente flotante). Convierte cada insight del panel en una
 * conversación con datos reales, sin que la persona tenga que redactar.
 */
export function BotonPreguntarAuli({ pregunta }: { pregunta: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("aulia:abrir-auli", { detail: { pregunta } })
        )
      }
      className="rounded-lg px-1.5 py-0.5 text-xs font-semibold text-marca-600 transition-colors hover:bg-marca-100/70 hover:text-marca-700"
      title="Profundizar con Auli"
    >
      ✨ Auli
    </button>
  );
}
