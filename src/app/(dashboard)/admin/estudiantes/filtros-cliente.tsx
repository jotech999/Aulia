"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Filtros de la lista de estudiantes: búsqueda por nombre/RUT (con rebote) y
 * filtro por curso. Actualizan la URL (?q=&curso=) para que el servidor filtre.
 */
export function FiltrosEstudiantes({
  cursos,
}: {
  cursos: { id: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  const curso = params.get("curso") ?? "";

  function aplicar(next: { q?: string; curso?: string }) {
    const p = new URLSearchParams(params.toString());
    const nq = next.q ?? q;
    const nc = next.curso ?? curso;
    if (nq.trim()) p.set("q", nq.trim());
    else p.delete("q");
    if (nc) p.set("curso", nc);
    else p.delete("curso");
    startTransition(() => router.replace(`/admin/estudiantes?${p.toString()}`, { scroll: false }));
  }

  // Rebote para la búsqueda por texto.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) aplicar({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-tenue" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o RUT…"
          aria-label="Buscar estudiante"
          className="w-full rounded-lg border border-borde bg-superficie py-2 pl-9 pr-3 text-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
        />
      </div>
      <select
        value={curso}
        onChange={(e) => aplicar({ curso: e.target.value })}
        aria-label="Filtrar por curso"
        className="rounded-lg border border-borde bg-superficie px-3 py-2 text-sm outline-none focus:border-marca-500"
      >
        <option value="">Todos los cursos</option>
        {cursos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
