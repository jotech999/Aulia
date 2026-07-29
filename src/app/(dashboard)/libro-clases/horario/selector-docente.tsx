"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SelectorDocente({
  docentes,
  seleccionado,
}: {
  docentes: Array<{ id: string; nombre: string }>;
  seleccionado: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function cambiar(docenteId: string) {
    const params = new URLSearchParams(searchParams.toString());
    for (const clave of ["cursoId", "asignaturaId", "versionId", "editar"]) {
      params.delete(clave);
    }
    if (docenteId) params.set("docenteId", docenteId);
    else params.delete("docenteId");
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <label className="inline-flex min-w-64 items-center gap-2 text-sm">
      <span className="shrink-0 font-semibold text-tinta-suave">Ver horario de</span>
      <select
        value={seleccionado ?? ""}
        onChange={(evento) => cambiar(evento.target.value)}
        className="min-h-10 w-full rounded-xl border border-borde-fuerte bg-superficie px-3 py-2 font-medium text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-200"
      >
        <option value="">Un curso</option>
        {docentes.map((docente) => (
          <option key={docente.id} value={docente.id}>{docente.nombre}</option>
        ))}
      </select>
    </label>
  );
}
