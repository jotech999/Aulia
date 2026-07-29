"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { confirmar } from "@/components/ui/confirmar";
import { eliminarComunicado } from "./actions";

export function EliminarComunicado({ id }: { id: string }) {
  const router = useRouter();
  async function borrar() {
    const ok = await confirmar({
      titulo: "¿Eliminar este comunicado?",
      mensaje: "Se archiva (retención 5 años) y deja de verse. No se puede deshacer.",
      textoConfirmar: "Eliminar",
      peligro: true,
    });
    if (!ok) return;
    const res = await eliminarComunicado(id);
    if (res.ok) {
      toast.exito("Comunicado eliminado.");
      router.refresh();
    } else toast.error(res.error);
  }
  return (
    <button
      type="button"
      onClick={() => void borrar()}
      className="shrink-0 text-xs font-medium text-tinta-tenue hover:text-peligro"
    >
      Eliminar
    </button>
  );
}
