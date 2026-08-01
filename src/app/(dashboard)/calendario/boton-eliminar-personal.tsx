"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarEventoPersonal } from "./actions";
import { confirmar } from "@/components/ui/confirmar";
import { toast } from "@/components/ui/toast";

/** Borra una nota personal PROPIA del calendario. */
export function BotonEliminarPersonal({ id, titulo }: { id: string; titulo: string }) {
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  async function borrar() {
    const ok = await confirmar({
      titulo: `¿Eliminar "${titulo}"?`,
      mensaje: "Es una nota personal tuya; se borra solo de tu calendario.",
      textoConfirmar: "Eliminar",
      peligro: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await eliminarEventoPersonal(id);
      if (r.ok) {
        toast.exito("Nota eliminada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <button
      type="button"
      onClick={() => void borrar()}
      disabled={pendiente}
      className="shrink-0 text-xs font-medium text-peligro hover:underline disabled:opacity-50"
    >
      Eliminar
    </button>
  );
}
