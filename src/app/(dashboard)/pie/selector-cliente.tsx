"use client";

import { useRouter } from "next/navigation";

type Opcion = { id: string; nombre: string; curso: string };

export function SelectorEstudiante({ estudiantes }: { estudiantes: Opcion[] }) {
  const router = useRouter();
  return (
    <select
      aria-label="Estudiante"
      defaultValue=""
      onChange={(e) => e.target.value && router.push(`/pie/${e.target.value}`)}
      className="w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
    >
      <option value="" disabled>
        Elige un estudiante…
      </option>
      {estudiantes.map((e) => (
        <option key={e.id} value={e.id}>
          {e.nombre}
          {e.curso ? ` · ${e.curso}` : ""}
        </option>
      ))}
    </select>
  );
}
