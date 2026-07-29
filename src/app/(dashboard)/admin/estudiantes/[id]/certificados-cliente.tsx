"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import {
  NOMBRE_TIPO,
  formatearFolio,
  type TipoCertificado,
} from "@/lib/certificados";
import { emitirCertificado, anularCertificado } from "./certificados-actions";

type Cert = {
  id: string;
  tipo: TipoCertificado;
  folio: number;
  emitidoEn: string;
  vigenciaHasta: string | null;
  anulado: boolean;
  token: string;
};

function fmt(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function Certificados({
  estudianteId,
  tieneMatricula,
  permisos,
  periodos,
  certificados,
}: {
  estudianteId: string;
  tieneMatricula: boolean;
  permisos: { alumnoRegular: boolean; notas: boolean; anular: boolean };
  periodos: number[];
  certificados: Cert[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(periodos[0] ?? 1);
  const [concepto, setConcepto] = useState("");

  const usaPeriodo = (t: TipoCertificado) => t === "NOTAS_PARCIALES" || t === "INFORME_SEMESTRAL";

  async function emitir(tipo: TipoCertificado) {
    setOcupado(true);
    setError(null);
    const res = await emitirCertificado(
      estudianteId,
      tipo,
      usaPeriodo(tipo) ? periodo : undefined,
      tipo === "INFORME_SEMESTRAL" || tipo === "INFORME_ANUAL" ? concepto : undefined
    );
    setOcupado(false);
    if (res.ok) {
      window.open(`/certificados/${res.id}/pdf`, "_blank");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function anular(id: string) {
    const motivo = window.prompt("Motivo de la anulación (queda auditado):");
    if (!motivo) return;
    const res = await anularCertificado(id, motivo);
    if (res.ok) router.refresh();
    else toast.error(res.error);
  }

  const algunPermiso = permisos.alumnoRegular || permisos.notas;

  function estadoDe(c: Cert): { txt: string; cls: string } {
    if (c.anulado) return { txt: "Anulado", cls: "bg-peligro-suave text-peligro" };
    if (c.vigenciaHasta && new Date(c.vigenciaHasta) < new Date()) {
      return { txt: "Expirado", cls: "bg-alerta-suave text-alerta" };
    }
    return { txt: "Vigente", cls: "bg-exito-suave text-exito" };
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Certificados</h2>

      {algunPermiso && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4 shadow-suave">
          {permisos.alumnoRegular && (
            <button
              type="button"
              onClick={() => void emitir("ALUMNO_REGULAR")}
              disabled={ocupado || !tieneMatricula}
              title={tieneMatricula ? undefined : "El estudiante no tiene matrícula vigente"}
              className="btn btn-primario"
            >
              Emitir alumno regular
            </button>
          )}
          {permisos.notas && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-medium text-tinta-tenue">
                  Semestre
                  <select
                    value={periodo}
                    onChange={(e) => setPeriodo(Number(e.target.value))}
                    className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
                  >
                    {periodos.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void emitir("INFORME_SEMESTRAL")}
                  disabled={ocupado || !tieneMatricula}
                  className="btn btn-primario"
                >
                  Boletín semestral
                </button>
                <button
                  type="button"
                  onClick={() => void emitir("INFORME_ANUAL")}
                  disabled={ocupado || !tieneMatricula}
                  className="rounded-xl border border-borde-fuerte bg-superficie px-4 py-2 text-sm font-semibold text-tinta hover:bg-superficie-2 disabled:opacity-50"
                >
                  Boletín anual
                </button>
                <button
                  type="button"
                  onClick={() => void emitir("NOTAS_PARCIALES")}
                  disabled={ocupado || !tieneMatricula}
                  className="rounded-xl border border-borde-fuerte bg-superficie px-4 py-2 text-sm font-semibold text-tinta hover:bg-superficie-2 disabled:opacity-50"
                >
                  Notas parciales
                </button>
              </div>
              <textarea
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                rows={2}
                maxLength={600}
                placeholder="Observaciones del profesor(a) jefe para el boletín (opcional)"
                className="w-full max-w-lg rounded-lg border border-borde px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-peligro">{error}</p>}

      {certificados.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-6 text-center text-sm text-tinta-tenue">
          Sin certificados emitidos.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {certificados.map((c) => {
            const estado = estadoDe(c);
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-superficie p-4 shadow-suave"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-tinta">
                      {NOMBRE_TIPO[c.tipo]}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${estado.cls}`}
                    >
                      {estado.txt}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-tinta-tenue">
                    Folio {formatearFolio(c.folio)} · emitido {fmt(c.emitidoEn)}
                    {c.vigenciaHasta ? ` · válido hasta ${fmt(c.vigenciaHasta)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm font-medium">
                  <a
                    href={`/certificados/${c.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-tinta hover:underline"
                  >
                    PDF
                  </a>
                  <a
                    href={`/verificar/${c.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-tinta-tenue hover:underline"
                  >
                    Verificar
                  </a>
                  {permisos.anular && !c.anulado && (
                    <button
                      type="button"
                      onClick={() => void anular(c.id)}
                      className="text-tinta-tenue hover:text-peligro"
                    >
                      Anular
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
