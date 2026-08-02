"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Boton } from "@/components/ui/boton";
import {
  ETIQUETA_PROMOCION,
  ESTILO_PROMOCION,
  type EstadoPromocion,
} from "@/lib/promocion";
import { resolverPromocion, borradorFundamentoIA } from "./actions";

export type FilaVista = {
  estudianteId: string;
  nombre: string;
  promedios: { nombre: string; promedio: number | null }[];
  asistencia: number | null;
  promedioGeneral: number | null;
  estadoPropuesto: EstadoPromocion;
  motivos: string[];
  reprobadas: string[];
  resolucion: { estado: EstadoPromocion; fundamento: string; resueltoEn: string } | null;
};

/**
 * Fila del cierre anual: muestra la propuesta del sistema (Art. 10) y, al
 * expandirla, permite a dirección registrar la resolución fundada (Art. 11).
 * El sistema nunca decide solo: el fundamento es obligatorio.
 */
export function FilaCierre({
  fila,
  anioEscolarId,
  puedeResolver,
  iaActiva,
}: {
  fila: FilaVista;
  anioEscolarId: string;
  puedeResolver: boolean;
  iaActiva: boolean;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [estado, setEstado] = useState<EstadoPromocion>(
    fila.resolucion?.estado ?? (fila.estadoPropuesto === "ANALISIS" ? "PROMOVIDO" : fila.estadoPropuesto)
  );
  const [fundamento, setFundamento] = useState(fila.resolucion?.fundamento ?? "");
  const [avisar, setAvisar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estadoMostrado = fila.resolucion?.estado ?? fila.estadoPropuesto;
  const difiere = fila.resolucion && fila.resolucion.estado !== fila.estadoPropuesto;

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const r = await resolverPromocion({
        estudianteId: fila.estudianteId,
        anioEscolarId,
        estado,
        estadoPropuesto: fila.estadoPropuesto,
        fundamento,
        promedioGeneral: fila.promedioGeneral,
        asistencia: fila.asistencia,
        avisarApoderado: avisar,
      });
      if (r.ok) {
        toast.exito("Resolución registrada.");
        setAbierta(false);
        router.refresh();
      } else setError(r.error);
    } finally {
      setGuardando(false);
    }
  }

  async function generarConIA() {
    setError(null);
    setGenerando(true);
    try {
      const r = await borradorFundamentoIA({ estudianteId: fila.estudianteId, anioEscolarId });
      if (r.ok) {
        setFundamento(r.borrador);
        toast.exito("Borrador listo. Revísalo y edítalo antes de firmar.");
      } else setError(r.error);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <tr className="border-b border-borde last:border-0">
        <td className="sticky left-0 z-10 min-w-[9.5rem] max-w-[13rem] bg-superficie px-3 py-2 text-[13px] font-medium leading-snug text-tinta sm:min-w-[14rem] sm:text-sm">
          {fila.nombre}
        </td>
        {fila.promedios.map((p) => (
          <td key={p.nombre} className="px-2 py-2 text-center tabular-nums">
            {p.promedio === null ? (
              <span className="text-tinta-tenue">—</span>
            ) : (
              <span className={p.promedio < 4 ? "font-semibold text-peligro" : "text-tinta"}>
                {p.promedio.toFixed(1)}
              </span>
            )}
          </td>
        ))}
        <td className="px-3 py-2 text-center font-bold tabular-nums text-tinta">
          {fila.promedioGeneral === null ? "—" : fila.promedioGeneral.toFixed(1)}
        </td>
        <td
          className={`px-3 py-2 text-center tabular-nums ${
            fila.asistencia === null
              ? "text-tinta-tenue"
              : fila.asistencia >= 85
                ? "text-exito"
                : "font-semibold text-peligro"
          }`}
        >
          {fila.asistencia === null ? "—" : `${fila.asistencia}%`}
        </td>
        <td className="px-3 py-2 text-center">
          <span
            className={`inline-block rounded-lg px-2 py-0.5 text-xs font-semibold ${ESTILO_PROMOCION[estadoMostrado]}`}
            title={fila.motivos.join(" ")}
          >
            {ETIQUETA_PROMOCION[estadoMostrado]}
          </span>
          {fila.resolucion && (
            <span className="ml-1 text-xs text-tinta-tenue" title="Resolución firmada por dirección">
              ✓
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-right">
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            aria-expanded={abierta}
            className="min-h-9 rounded-lg px-2 text-xs font-semibold text-marca-600 hover:bg-marca-50 hover:text-marca-700"
          >
            {abierta ? "Cerrar" : fila.resolucion ? "Ver resolución" : "Resolver"}
          </button>
        </td>
      </tr>

      {abierta && (
        <tr className="border-b border-borde bg-superficie-2">
          <td colSpan={fila.promedios.length + 5} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                  Situación según el Decreto 67 (Art. 10)
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-tinta-suave">
                  {fila.motivos.map((m, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span aria-hidden className="text-tinta-tenue">
                        ·
                      </span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-tinta-tenue">
                  Propuesta del sistema:{" "}
                  <strong className="text-tinta">{ETIQUETA_PROMOCION[fila.estadoPropuesto]}</strong>.
                  La decisión final la resuelve la dirección de forma fundada (Art. 11).
                </p>
                {difiere && (
                  <p className="mt-2 rounded-lg bg-alerta-suave px-2.5 py-1.5 text-xs text-alerta">
                    La resolución registrada difiere de la propuesta del sistema. El fundamento
                    respalda esa diferencia.
                  </p>
                )}
                {fila.resolucion && (
                  <p className="mt-2 text-xs text-tinta-tenue">
                    Resuelto el {fila.resolucion.resueltoEn}.
                  </p>
                )}
              </div>

              <div>
                {puedeResolver ? (
                  <>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs font-medium text-tinta-tenue">
                        Resolución
                        <select
                          value={estado}
                          onChange={(e) => setEstado(e.target.value as EstadoPromocion)}
                          className="mt-0.5 block min-h-11 rounded-lg border border-borde bg-superficie px-2 text-sm"
                        >
                          <option value="PROMOVIDO">Promovido</option>
                          <option value="REPITE">Repite</option>
                          <option value="ANALISIS">Sigue en análisis</option>
                        </select>
                      </label>
                      {iaActiva && (
                        <Boton
                          type="button"
                          variante="secundario"
                          tamano="sm"
                          disabled={generando}
                          onClick={() => void generarConIA()}
                        >
                          {generando ? "Redactando…" : "✨ Redactar informe (IA)"}
                        </Boton>
                      )}
                    </div>
                    <textarea
                      value={fundamento}
                      onChange={(e) => setFundamento(e.target.value)}
                      rows={8}
                      placeholder="Fundamento de la resolución: progreso del aprendizaje, brecha con el curso, consecuencias de la repitencia y medidas de acompañamiento (Art. 11)."
                      className="mt-2 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm leading-relaxed"
                      aria-label="Fundamento de la resolución"
                    />
                    {error && <p className="mt-1.5 text-sm text-peligro">{error}</p>}
                    <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-borde bg-superficie p-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={avisar}
                        onChange={(e) => setAvisar(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium text-tinta">Avisar al apoderado</span>
                        <span className="block text-xs text-tinta-tenue">
                          Le llega una notificación para que revise el resultado en la ficha de su
                          pupilo. El aviso no incluye el fundamento. Déjalo sin marcar si el
                          colegio prefiere comunicarlo en persona o todo junto al final.
                        </span>
                      </span>
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Boton
                        type="button"
                        disabled={guardando || fundamento.trim().length < 20}
                        onClick={() => void guardar()}
                      >
                        {guardando ? "Guardando…" : "Firmar resolución"}
                      </Boton>
                      <span className="text-xs text-tinta-tenue">
                        Queda registrada en la auditoría con tu nombre y la fecha.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-borde bg-superficie p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                      Fundamento
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-tinta-suave">
                      {fila.resolucion?.fundamento ?? "Aún sin resolución. La firma la dirección."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
