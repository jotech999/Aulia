"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { iniciarPagoWebpay } from "@/app/(dashboard)/admin/finanzas/actions";
import { Boton } from "@/components/ui/boton";

/**
 * Botón de pago Webpay. Inicia la transacción y redirige al pagador a Webpay
 * mediante un POST de formulario con el token (así lo espera Transbank).
 */
export function PagarWebpay({ cuotaId, etiqueta, peligro }: { cuotaId: string; etiqueta: string; peligro?: boolean }) {
  const [ocupado, setOcupado] = useState(false);

  async function pagar() {
    setOcupado(true);
    const res = await iniciarPagoWebpay(cuotaId);
    if (!res.ok) {
      toast.error(res.error);
      setOcupado(false);
      return;
    }
    // Redirección a Webpay: form POST con token_ws.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = res.url;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "token_ws";
    input.value = res.token;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <Boton
      type="button"
      tamano="sm"
      variante={peligro ? "peligro" : "primario"}
      onClick={pagar}
      disabled={ocupado}
    >
      {ocupado ? "Redirigiendo…" : etiqueta}
    </Boton>
  );
}
