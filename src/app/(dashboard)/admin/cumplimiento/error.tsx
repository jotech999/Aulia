"use client";

import { Boton } from "@/components/ui/boton";

export default function ErrorCumplimiento({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-peligro/25 bg-peligro-suave p-6 text-center" role="alert">
      <p className="font-display text-lg font-bold text-peligro">
        No pudimos preparar el diagnóstico
      </p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-tinta-suave">
        La información del establecimiento no se modificó. Intenta nuevamente;
        si el problema continúa, revisa el estado de la base de datos y las migraciones pendientes.
      </p>
      <Boton type="button" variante="secundario" className="mt-5" onClick={reset}>
        Reintentar
      </Boton>
    </div>
  );
}
