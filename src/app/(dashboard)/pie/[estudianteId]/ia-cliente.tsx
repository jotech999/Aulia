"use client";

import { useState, useTransition } from "react";
import { proponerPaciIA, redactarInformePieIA } from "../ia-actions";
import type { BorradorPaci } from "@/lib/ia/pie";

/**
 * APOYO CON IA PARA EL EQUIPO PIE — PACI (Decreto 83) e informe a la familia.
 *
 * El diseño de esta pantalla es deliberadamente incómodo en un punto: el texto
 * clínico NO se manda solo. Se muestra pre-cargado desde la ficha, la
 * profesional lo edita y tiene que marcar una casilla reconociendo que ese
 * texto sale del colegio. Un dato de salud no puede irse a un servicio externo
 * porque alguien apretó un botón sin saber qué contenía.
 *
 * Todo lo que sale de aquí es un BORRADOR: se copia, se pega y se firma. La
 * ficha no cambia sola.
 */
export function ApoyoIaPie({
  estudianteId,
  diagnosticoInicial,
  apoyosIniciales,
}: {
  estudianteId: string;
  diagnosticoInicial: string;
  apoyosIniciales: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"paci" | "informe">("paci");
  const [consciente, setConsciente] = useState(false);

  const [situacion, setSituacion] = useState(diagnosticoInicial);
  const [apoyos, setApoyos] = useState(apoyosIniciales);
  const [periodo, setPeriodo] = useState("Primer semestre");
  const [avances, setAvances] = useState("");

  const [paci, setPaci] = useState<BorradorPaci | null>(null);
  const [informe, setInforme] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function generar() {
    setError(null);
    setPaci(null);
    setInforme(null);
    startTransition(async () => {
      if (modo === "paci") {
        const r = await proponerPaciIA({ estudianteId, situacion, apoyosActuales: apoyos });
        if (r.ok) setPaci(r.paci);
        else setError(r.error);
      } else {
        const r = await redactarInformePieIA({ estudianteId, periodo, avances });
        if (r.ok) setInforme(r.informe);
        else setError(r.error);
      }
    });
  }

  function copiar() {
    const texto = informe ?? (paci ? paciATexto(paci) : "");
    if (!texto) return;
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      })
      .catch(() => setError("No se pudo copiar al portapapeles."));
  }

  const listo =
    consciente &&
    !pendiente &&
    (modo === "paci" ? situacion.trim().length >= 30 : avances.trim().length >= 20);

  return (
    <section className="mt-8 rounded-xl border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight">Apoyo con IA</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-tinta-tenue">
            Borradores del plan de adecuación curricular (Decreto 83) y del informe a la familia.
            Ahorran la escritura, no la decisión: revisas, editas y firmas tú.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="rounded-lg border border-acento/40 bg-acento/10 px-3 py-1.5 text-sm font-semibold text-marca-700 transition-colors hover:bg-acento/20"
        >
          {abierto ? "Cerrar" : "✨ Abrir"}
        </button>
      </div>

      {abierto && (
        <div className="mt-4">
          <div className="flex gap-1.5">
            {(
              [
                ["paci", "Plan de adecuación (PACI)"],
                ["informe", "Informe a la familia"],
              ] as const
            ).map(([k, etiqueta]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setModo(k);
                  setError(null);
                }}
                aria-pressed={modo === k}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  modo === k
                    ? "bg-marca-600 text-white"
                    : "border border-borde text-tinta-suave hover:bg-superficie-2"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          {modo === "paci" ? (
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-tinta-tenue">
                Situación educativa que se enviará
                <textarea
                  value={situacion}
                  onChange={(e) => setSituacion(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="Qué necesita para aprender, cómo se manifiesta en clases, qué funciona y qué no…"
                  className="mt-1 w-full resize-y rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm leading-relaxed text-tinta focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
                />
              </label>
              <p className="rounded-lg bg-superficie-2 px-3 py-2 text-xs leading-relaxed text-tinta-suave">
                Viene de la ficha, pero <strong>puedes editarlo antes de enviarlo</strong>. Escríbelo
                en términos pedagógicos —qué necesita para aprender— más que clínicos: el plan es
                escolar, no un tratamiento. No incluyas el nombre ni el RUT; si quedan, se descartan.
              </p>
              <label className="block text-xs font-medium text-tinta-tenue">
                Apoyos que ya se entregan (opcional)
                <textarea
                  value={apoyos}
                  onChange={(e) => setApoyos(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="mt-1 w-full resize-y rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm leading-relaxed text-tinta focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
                />
              </label>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-tinta-tenue">
                Período
                <input
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  maxLength={60}
                  className="mt-1 w-full rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm text-tinta focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
                />
              </label>
              <label className="block text-xs font-medium text-tinta-tenue">
                Qué se trabajó y qué avances hubo
                <textarea
                  value={avances}
                  onChange={(e) => setAvances(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="Sesiones realizadas, logros concretos, dificultades que persisten, acuerdos con la familia…"
                  className="mt-1 w-full resize-y rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm leading-relaxed text-tinta focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
                />
              </label>
              <p className="rounded-lg bg-superficie-2 px-3 py-2 text-xs leading-relaxed text-tinta-suave">
                El informe se acompaña con datos agregados del período (promedio, asistencia y
                sesiones registradas). No incluyas el nombre del estudiante.
              </p>
            </div>
          )}

          <label className="mt-3 flex items-start gap-2 rounded-lg border border-alerta/30 bg-alerta-suave px-3 py-2.5 text-xs leading-relaxed text-alerta">
            <input
              type="checkbox"
              checked={consciente}
              onChange={(e) => setConsciente(e.target.checked)}
              className="mt-0.5 accent-alerta"
            />
            <span>
              Entiendo que el texto de arriba se enviará a un servicio de IA externo para generar el
              borrador, que <strong>no se guarda</strong> allá ni acá, y que este uso queda
              registrado en la auditoría del colegio a mi nombre.
            </span>
          </label>

          <button
            type="button"
            onClick={generar}
            disabled={!listo}
            className="mt-3 btn btn-primario"
          >
            {pendiente
              ? "Redactando…"
              : modo === "paci"
                ? "Proponer plan de adecuación"
                : "Redactar informe"}
          </button>

          {error && <p className="mt-2 text-sm text-peligro">{error}</p>}

          {(paci || informe) && (
            <div className="mt-4 rounded-xl border border-borde bg-superficie-2 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-tinta">Borrador</span>
                <button
                  type="button"
                  onClick={copiar}
                  className="text-xs font-semibold text-marca-600 hover:text-marca-700"
                >
                  {copiado ? "¡Copiado!" : "Copiar"}
                </button>
              </div>

              {informe && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-tinta-suave">
                  {informe}
                </p>
              )}

              {paci && (
                <div className="space-y-4 text-sm">
                  <p className="leading-relaxed text-tinta-suave">{paci.sintesis}</p>
                  <BloqueAdecuaciones
                    titulo="Adecuaciones de acceso"
                    nota="No cambian el objetivo de aprendizaje: cambian cómo se presenta, cómo se responde, el entorno y los tiempos."
                    items={paci.acceso}
                  />
                  <BloqueAdecuaciones
                    titulo="Adecuaciones en los objetivos de aprendizaje"
                    nota="Excepcionales: requieren justificación y revisión periódica."
                    items={paci.objetivos}
                    vacio="No se proponen: con las adecuaciones de acceso debería bastar."
                  />
                  <Parrafo titulo="Trabajo con la familia" texto={paci.trabajoConLaFamilia} />
                  <Parrafo titulo="Seguimiento" texto={paci.seguimiento} />
                </div>
              )}

              <p className="mt-3 text-[11px] leading-snug text-tinta-tenue">
                Generado por IA: puede contener errores y no reemplaza el juicio profesional ni la
                evaluación diagnóstica. Revísalo y edítalo antes de incorporarlo al expediente.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BloqueAdecuaciones({
  titulo,
  nota,
  items,
  vacio,
}: {
  titulo: string;
  nota: string;
  items: { ambito: string; propuesta: string; comoSeEvalua: string }[];
  vacio?: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-tinta">{titulo}</h3>
      <p className="mt-0.5 text-[11px] leading-snug text-tinta-tenue">{nota}</p>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-tinta-tenue">{vacio ?? "—"}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((a, i) => (
            <li key={i} className="rounded-lg border border-borde bg-superficie p-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-marca-700">
                {a.ambito}
              </p>
              <p className="mt-0.5 leading-relaxed text-tinta-suave">{a.propuesta}</p>
              {a.comoSeEvalua && (
                <p className="mt-1 text-xs italic leading-relaxed text-tinta-tenue">
                  Cómo se verifica: {a.comoSeEvalua}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Parrafo({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-tinta">{titulo}</h3>
      <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-tinta-suave">{texto}</p>
    </div>
  );
}

function paciATexto(p: BorradorPaci): string {
  const lista = (items: { ambito: string; propuesta: string; comoSeEvalua: string }[]) =>
    items.length === 0
      ? "  (ninguna)"
      : items
          .map((a) => `  · [${a.ambito}] ${a.propuesta}\n    Cómo se verifica: ${a.comoSeEvalua}`)
          .join("\n");

  return [
    "PLAN DE ADECUACIÓN CURRICULAR INDIVIDUAL (borrador)",
    "",
    p.sintesis,
    "",
    "ADECUACIONES DE ACCESO",
    lista(p.acceso),
    "",
    "ADECUACIONES EN LOS OBJETIVOS DE APRENDIZAJE",
    lista(p.objetivos),
    "",
    "TRABAJO CON LA FAMILIA",
    p.trabajoConLaFamilia,
    "",
    "SEGUIMIENTO",
    p.seguimiento,
  ].join("\n");
}
