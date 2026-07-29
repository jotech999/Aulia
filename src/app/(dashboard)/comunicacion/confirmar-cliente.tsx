"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marcarLeido } from "./actions";
import { Boton } from "@/components/ui/boton";

/** Botón del apoderado para confirmar lectura del comunicado que está viendo. */
export function ConfirmarLectura({ comunicadoId }: { comunicadoId: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    setOcupado(true);
    await marcarLeido(comunicadoId);
    setOcupado(false);
    router.refresh();
  }

  return (
    <Boton type="button" onClick={() => void confirmar()} disabled={ocupado}>
      {ocupado ? "Confirmando…" : "Confirmar lectura"}
    </Boton>
  );
}
