"use client";

import { usePathname } from "next/navigation";

/**
 * Botón flotante de retroalimentación para el modo demo. Abre un correo
 * prellenado (mailto) hacia quien comparte el demo, incluyendo la página actual.
 * Solo se renderiza cuando DEMO_FEEDBACK_EMAIL está configurada (ver layout),
 * así no aparece en producción normal. Sin base de datos ni backend.
 */
export function BotonComentario({ email }: { email: string }) {
  const pathname = usePathname();

  function abrir() {
    const url = typeof window !== "undefined" ? window.location.href : pathname;
    const asunto = "Comentario sobre el demo de Aulia";
    const cuerpo = [
      "Estoy probando el demo de Aulia. Mi comentario:",
      "",
      "• Qué me gustó:",
      "",
      "• Qué me confundió o cambiaría:",
      "",
      "• Qué me faltó:",
      "",
      "----",
      `Página: ${url}`,
    ].join("\n");
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(
      asunto
    )}&body=${encodeURIComponent(cuerpo)}`;
  }

  return (
    <button
      type="button"
      onClick={abrir}
      className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-borde bg-superficie px-4 py-2.5 text-sm font-semibold text-tinta shadow-flotante transition-transform hover:-translate-y-0.5"
      aria-label="Enviar un comentario sobre el demo"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] text-marca-600" aria-hidden>
        <path d="M4 5h16v10H9l-4 3.5V15H4Z" />
        <path d="M8 9h8M8 12h5" />
      </svg>
      Enviar comentario
    </button>
  );
}
