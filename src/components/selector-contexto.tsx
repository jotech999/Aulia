"use client";

import { useState, useTransition } from "react";
import { cambiarContexto } from "@/app/(dashboard)/contexto-actions";
import { toast } from "@/components/ui/toast";

export type OpcionContexto = {
  id: string;
  colegioNombre: string;
  rol: string;
};

const ROL: Record<string, string> = {
  ADMIN: "Administrador",
  DIRECTOR: "Director",
  UTP: "UTP",
  PROFESOR_JEFE: "Profesor jefe",
  PROFESOR: "Profesor",
  INSPECTOR: "Inspector",
  APODERADO: "Apoderado",
  PIE: "Equipo PIE",
  SOSTENEDOR: "Sostenedor",
  ESTUDIANTE: "Estudiante",
};

function hayAsistenciaPendienteLocal() {
  try {
    return Object.keys(localStorage).some(
      (clave) =>
        (clave.startsWith("aulia:asistencia:cola:") ||
          // Prefijo anterior al cambio de marca: puede quedar si la migración
          // de claves locales aún no alcanzó a correr en este navegador.
          clave.startsWith("ciudi:asistencia:cola:")) &&
        localStorage.getItem(clave) !== "[]"
    );
  } catch {
    return false;
  }
}

export function SelectorContexto({
  actualId,
  opciones,
  compacto = false,
}: {
  actualId: string;
  opciones: OpcionContexto[];
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const actual = opciones.find((o) => o.id === actualId) ?? opciones[0];
  if (opciones.length < 2 || !actual) return null;

  function elegir(id: string) {
    if (id === actualId || pendiente) return;
    if (hayAsistenciaPendienteLocal()) {
      toast.advertencia(
        "Hay asistencia guardada en este dispositivo. Sincronízala antes de cambiar de perfil."
      );
      return;
    }
    startTransition(async () => {
      const resultado = await cambiarContexto({ membresiaId: id });
      if (resultado && !resultado.ok) toast.error(resultado.error);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-borde bg-superficie px-3 text-left text-sm shadow-suave transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500/40 ${
          compacto ? "max-w-44" : "max-w-64"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-tinta">{actual.colegioNombre}</span>
          <span className="block truncate text-xs text-tinta-tenue">{ROL[actual.rol] ?? actual.rol}</span>
        </span>
        <span aria-hidden className="text-tinta-tenue">⌄</span>
      </button>

      {abierto && (
        <div
          role="listbox"
          aria-label="Elegir perfil y establecimiento"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-borde bg-superficie p-1.5 shadow-elevada"
        >
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
            Trabajar como
          </p>
          {opciones.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              role="option"
              aria-selected={opcion.id === actualId}
              disabled={pendiente}
              onClick={() => elegir(opcion.id)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                opcion.id === actualId
                  ? "bg-marca-50 text-marca-700"
                  : "text-tinta hover:bg-superficie-2"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{opcion.colegioNombre}</span>
                <span className="block text-xs opacity-70">{ROL[opcion.rol] ?? opcion.rol}</span>
              </span>
              {opcion.id === actualId && <span aria-label="Perfil actual">✓</span>}
            </button>
          ))}
          {pendiente && (
            <p className="px-3 py-2 text-xs text-tinta-tenue" role="status">
              Cambiando contexto…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

