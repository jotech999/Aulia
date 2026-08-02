"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { NOMBRE_ROL } from "@/lib/personas";

/**
 * Buscador + filtro por rol del directorio. Escribe el estado en la URL para
 * que un resultado se pueda compartir o volver a él con el botón atrás.
 */
export function FiltrosPersonas({
  conteoPorRol,
  total,
}: {
  conteoPorRol: Record<string, number>;
  total: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [texto, setTexto] = useState(sp.get("q") ?? "");
  const rolActivo = sp.get("rol") ?? "";
  const inactivos = sp.get("inactivos") === "1";

  function navegar(cambios: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.push(`/admin/personas${p.toString() ? `?${p}` : ""}`);
  }

  // Roles con al menos una persona, en orden de jerarquía escolar.
  const ORDEN = [
    "DIRECTOR",
    "UTP",
    "INSPECTOR",
    "PROFESOR_JEFE",
    "PROFESOR",
    "PIE",
    "APODERADO",
    "ESTUDIANTE",
    "ADMIN",
  ];
  const roles = ORDEN.filter((r) => (conteoPorRol[r] ?? 0) > 0);

  return (
    <div className="mt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navegar({ q: texto });
        }}
        className="flex flex-wrap items-center gap-2"
        role="search"
      >
        <label className="sr-only" htmlFor="buscar-persona">
          Buscar persona
        </label>
        <input
          id="buscar-persona"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre, correo o RUT…"
          className="min-h-11 flex-1 rounded-lg border border-borde bg-superficie px-3 text-sm outline-none transition focus:border-marca-500 focus:ring-2 focus:ring-marca-200 sm:max-w-sm"
        />
        <button type="submit" className="btn btn-secundario btn-sm min-h-11">
          Buscar
        </button>
        {(sp.get("q") || rolActivo || inactivos) && (
          <button
            type="button"
            onClick={() => {
              setTexto("");
              router.push("/admin/personas");
            }}
            className="text-sm text-tinta-tenue hover:text-tinta"
          >
            Limpiar
          </button>
        )}
      </form>

      <div className="tira-movil mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar por rol">
        <button
          type="button"
          role="tab"
          aria-selected={!rolActivo}
          onClick={() => navegar({ rol: null })}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            !rolActivo
              ? "bg-marca-600 text-white"
              : "border border-borde bg-superficie text-tinta-suave hover:bg-superficie-2"
          }`}
        >
          Todos
        </button>
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={rolActivo === r}
            onClick={() => navegar({ rol: r })}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              rolActivo === r
                ? "bg-marca-600 text-white"
                : "border border-borde bg-superficie text-tinta-suave hover:bg-superficie-2"
            }`}
          >
            {NOMBRE_ROL[r] ?? r}
            <span className="ml-1 tabular-nums opacity-70">{conteoPorRol[r]}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-tinta-tenue">
          {total} {total === 1 ? "persona" : "personas"} en la vista
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-tinta-tenue">
          <input
            type="checkbox"
            checked={inactivos}
            onChange={(e) => navegar({ inactivos: e.target.checked ? "1" : null })}
          />
          Incluir accesos revocados
        </label>
      </div>
    </div>
  );
}
