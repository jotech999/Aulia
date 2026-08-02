"use client";

import { useRouter } from "next/navigation";

export function SelectorCurso({
  cursos,
  cursoId,
}: {
  cursos: { id: string; etiqueta: string }[];
  cursoId: string;
}) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-tinta-suave">
      <span className="sr-only">Curso</span>
      <select
        value={cursoId}
        onChange={(e) => router.push(`/cierre-anual?cursoId=${e.target.value}`)}
        className="min-h-11 rounded-lg border border-borde bg-superficie px-3 text-sm font-medium text-tinta shadow-suave"
      >
        {cursos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}
