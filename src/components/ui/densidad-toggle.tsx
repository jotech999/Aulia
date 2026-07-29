"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { COOKIE_DENSIDAD, type Densidad } from "@/lib/densidad";

/**
 * Conmutador de densidad de tabla (cómodo / compacto). Persiste en cookie por
 * un año y refresca el server component para re-renderizar con la nueva
 * densidad sin recargar la página.
 */
export function DensidadToggle({ densidad }: { densidad: Densidad }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const set = (d: Densidad) => {
    if (d === densidad) return;
    document.cookie = `${COOKIE_DENSIDAD}=${d}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };

  const opciones: [Densidad, string][] = [
    ["comodo", "Cómodo"],
    ["compacto", "Compacto"],
  ];

  return (
    <div
      role="group"
      aria-label="Densidad de la tabla"
      className="inline-flex rounded-lg border border-borde bg-superficie p-0.5 text-xs shadow-suave"
    >
      {opciones.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          aria-pressed={densidad === v}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            densidad === v ? "bg-marca-600 text-white" : "text-tinta-suave hover:text-tinta"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
