"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmar } from "@/components/ui/confirmar";
import { toast } from "@/components/ui/toast";
import { cambiarAccesoPersona } from "./actions";

/**
 * Revocar / reactivar el acceso de una persona. Nunca se borra la cuenta: el
 * historial del libro de clases debe conservarse (Circular 30).
 */
export function AccionesPersona({
  membresiaId,
  nombre,
  activa,
  puedeGestionar,
}: {
  membresiaId: string;
  nombre: string;
  activa: boolean;
  puedeGestionar: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  if (!puedeGestionar) return null;

  async function cambiar() {
    if (activa) {
      const ok = await confirmar({
        titulo: `¿Revocar el acceso de ${nombre}?`,
        mensaje:
          "No podrá entrar a la plataforma. Su historial y sus registros se conservan intactos, y puedes reactivarla cuando quieras.",
        textoConfirmar: "Revocar acceso",
        peligro: true,
      });
      if (!ok) return;
    }
    setOcupado(true);
    try {
      const r = await cambiarAccesoPersona({ membresiaId, activa: !activa });
      if (r.ok) {
        toast.exito(activa ? "Acceso revocado." : "Acceso reactivado.");
        router.refresh();
      } else toast.error(r.error);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void cambiar()}
      disabled={ocupado}
      className={`min-h-9 whitespace-nowrap rounded-lg px-2 text-xs font-semibold transition-colors ${
        activa
          ? "text-tinta-tenue hover:bg-peligro-suave hover:text-peligro"
          : "text-marca-600 hover:bg-marca-50 hover:text-marca-700"
      }`}
    >
      {ocupado ? "…" : activa ? "Revocar" : "Reactivar"}
    </button>
  );
}
