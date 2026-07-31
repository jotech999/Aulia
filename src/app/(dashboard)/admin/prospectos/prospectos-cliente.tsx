"use client";

import { useMemo, useState, useTransition } from "react";
import { marcarContactado } from "./acciones";

export type Prospecto = {
  id: string;
  nombre: string;
  email: string;
  colegio: string | null;
  cargo: string | null;
  telefono: string | null;
  mensaje: string | null;
  origen: string | null;
  creadoEn: string; // ISO
  contactado: boolean;
};

const ORIGEN_ETIQUETA: Record<string, string> = {
  auli: "Auli (chat)",
  landing: "Formulario",
};

function csvCampo(v: string | null): string {
  const s = v ?? "";
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function TablaProspectos({ prospectos }: { prospectos: Prospecto[] }) {
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "contactados">("todos");
  const [pendiente, startTransition] = useTransition();

  const visibles = useMemo(() => {
    if (filtro === "pendientes") return prospectos.filter((p) => !p.contactado);
    if (filtro === "contactados") return prospectos.filter((p) => p.contactado);
    return prospectos;
  }, [prospectos, filtro]);

  function exportarCSV() {
    const cabecera = "nombre;email;colegio;cargo;telefono;origen;fecha;contactado;notas";
    const filas = prospectos.map((p) =>
      [
        csvCampo(p.nombre),
        csvCampo(p.email),
        csvCampo(p.colegio),
        csvCampo(p.cargo),
        csvCampo(p.telefono),
        csvCampo(ORIGEN_ETIQUETA[p.origen ?? ""] ?? p.origen),
        new Date(p.creadoEn).toLocaleDateString("es-CL"),
        p.contactado ? "sí" : "no",
        csvCampo(p.mensaje),
      ].join(";")
    );
    // BOM para que Excel en Windows abra los acentos bien.
    const blob = new Blob(["﻿" + [cabecera, ...filas].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospectos-aulia-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(
            [
              ["todos", "Todos"],
              ["pendientes", "Por contactar"],
              ["contactados", "Contactados"],
            ] as const
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filtro === id
                  ? "bg-marca-600 text-white"
                  : "border border-borde text-tinta-suave hover:text-tinta"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportarCSV} className="btn btn-secundario text-sm">
          Descargar CSV ({prospectos.length})
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-borde bg-superficie-2 px-4 py-8 text-center text-sm text-tinta-suave">
          {prospectos.length === 0
            ? "Aún no hay prospectos. Cuando alguien deje su correo con Auli o el formulario de la landing, aparecerá aquí."
            : "No hay prospectos en este filtro."}
        </p>
      ) : (
        <div className="superficie overflow-x-auto rounded-2xl border border-borde shadow-suave">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-xs uppercase tracking-wide text-tinta-tenue">
                <th className="px-4 py-3 font-semibold">Contacto</th>
                <th className="px-4 py-3 font-semibold">Colegio / cargo</th>
                <th className="px-4 py-3 font-semibold">Origen</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} className="border-b border-borde/60 last:border-0 hover:bg-superficie-2/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-tinta">{p.nombre}</p>
                    <a href={`mailto:${p.email}`} className="text-marca-600 hover:text-marca-700">
                      {p.email}
                    </a>
                    {p.telefono && <p className="text-xs text-tinta-tenue">{p.telefono}</p>}
                    {p.mensaje && (
                      <p className="mt-1 max-w-xs text-xs leading-snug text-tinta-tenue">{p.mensaje}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tinta-suave">
                    <p>{p.colegio ?? "—"}</p>
                    {p.cargo && <p className="text-xs text-tinta-tenue">{p.cargo}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        p.origen === "auli"
                          ? "bg-marca-100 text-marca-700"
                          : "bg-superficie-3 text-tinta-suave"
                      }`}
                    >
                      {ORIGEN_ETIQUETA[p.origen ?? ""] ?? p.origen ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-tinta-suave">
                    {new Date(p.creadoEn).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        startTransition(() => marcarContactado(p.id, !p.contactado))
                      }
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        p.contactado
                          ? "bg-exito-suave text-exito hover:opacity-80"
                          : "border border-borde-fuerte text-tinta-suave hover:text-tinta"
                      }`}
                    >
                      {p.contactado ? "✓ Contactado" : "Marcar contactado"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
