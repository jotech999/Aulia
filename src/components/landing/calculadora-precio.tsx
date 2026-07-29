"use client";

import { useMemo, useState } from "react";
import {
  DESCUENTO_RED,
  PLANES,
  TRAMOS,
  UF_REFERENCIA_CLP,
  UF_REFERENCIA_FECHA,
  cotizar,
  formatearCLP,
  formatearUF,
  repartirEnTramos,
} from "@/lib/precios";

/**
 * Calculadora de precio para la landing. Existe porque el precio ahora depende de
 * la matrícula: el director tiene que poder ver SU número antes de pedir una demo.
 * En un mercado donde casi ningún competidor publica tarifas, mostrar el cálculo
 * completo — tramos incluidos — es en sí mismo un argumento de venta.
 */
export function CalculadoraPrecio() {
  const [matricula, setMatricula] = useState(600);
  const [idPlan, setIdPlan] = useState("pro");
  const [red, setRed] = useState(false);

  const plan = PLANES.find((p) => p.id === idPlan) ?? PLANES[1];
  const cotizacion = useMemo(() => cotizar(plan, matricula, { red }), [plan, matricula, red]);
  const reparto = useMemo(() => repartirEnTramos(matricula), [matricula]);

  return (
    <div className="superficie overflow-hidden rounded-3xl">
      <div className="grid gap-0 lg:grid-cols-[1fr_0.9fr]">
        {/* Controles */}
        <div className="p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-marca-600">
            Calculadora
          </p>
          <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-tinta">
            Cuánto costaría en tu colegio
          </h3>
          <p className="mt-2 text-sm text-tinta-suave">
            Mueve tu matrícula y elige el plan. El precio que ves es el precio que
            cotizamos: no hay letra chica ni cargos de implementación.
          </p>

          <label htmlFor="matricula" className="mt-7 block text-sm font-semibold text-tinta">
            Matrícula del establecimiento
            <span className="ml-2 cifra text-lg text-marca-700">
              {matricula.toLocaleString("es-CL")}
            </span>
            <span className="text-sm font-normal text-tinta-tenue"> estudiantes</span>
          </label>
          <input
            id="matricula"
            type="range"
            min={50}
            max={2500}
            step={10}
            value={matricula}
            onChange={(e) => setMatricula(Number(e.target.value))}
            className="mt-3 w-full accent-marca-600"
            aria-describedby="total-anual"
          />
          <div className="flex justify-between text-[11px] text-tinta-tenue">
            <span>50</span>
            <span>2.500</span>
          </div>

          <fieldset className="mt-7">
            <legend className="text-sm font-semibold text-tinta">Plan</legend>
            <div className="mt-3 space-y-2">
              {PLANES.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    p.id === idPlan
                      ? "border-marca-500 bg-marca-50"
                      : "border-borde bg-superficie hover:bg-superficie-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={p.id}
                    checked={p.id === idPlan}
                    onChange={() => setIdPlan(p.id)}
                    className="mt-0.5 accent-marca-600"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-tinta">
                      {p.nombre}
                      {p.destacado && (
                        <span className="insignia insignia-marca !py-0 text-[10px]">Más elegido</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-tinta-tenue">
                      UF {formatearUF(p.ufPorEstudiante)} por estudiante al año · mínimo{" "}
                      UF {p.pisoUf}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-borde bg-superficie-2 p-3">
            <input
              type="checkbox"
              checked={red}
              onChange={(e) => setRed(e.target.checked)}
              className="mt-0.5 accent-marca-600"
            />
            <span className="text-sm text-tinta">
              Soy sostenedor de 2 o más establecimientos
              <span className="mt-0.5 block text-xs text-tinta-tenue">
                {Math.round(DESCUENTO_RED * 100)}% de descuento adicional sobre el total de la red.
              </span>
            </span>
          </label>
        </div>

        {/* Resultado */}
        <div className="encabezado-cine malla-academica flex flex-col justify-center p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
            {plan.nombre} · facturación anual
          </p>

          <p id="total-anual" className="mt-3 flex items-baseline gap-2">
            <span className="cifra resplandor-dato text-5xl text-white">
              UF {formatearUF(cotizacion.ufAnual)}
            </span>
            <span className="text-sm text-white/60">/año</span>
          </p>
          <p className="mt-1 text-sm text-white/70">
            ≈ {formatearCLP(cotizacion.clpAnual)} al año
          </p>

          <div className="mt-6 rounded-2xl bg-white/10 p-4">
            <p className="text-xs text-white/70">Costo por estudiante</p>
            <p className="cifra mt-0.5 text-2xl text-white">
              {formatearCLP(cotizacion.clpPorEstudianteMes)}
              <span className="ml-1 text-sm font-normal text-white/60">al mes</span>
            </p>
            <p className="mt-1 text-xs text-white/60">
              Menos que una fotocopia por estudiante a la semana.
            </p>
          </div>

          {/* Desglose de tramos: transparencia total del cálculo */}
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Cómo se calcula
            </p>
            {cotizacion.aplicaPiso ? (
              <p className="mt-2 text-sm text-white/80">
                Con {matricula.toLocaleString("es-CL")} estudiantes el cálculo por
                matrícula queda bajo el mínimo del plan, así que se aplica el mínimo de{" "}
                <strong className="font-semibold text-white">UF {plan.pisoUf}</strong> al año.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {reparto.map((tramo) => (
                  <li key={tramo.etiqueta} className="flex items-baseline justify-between gap-3">
                    <span className="text-white/70">
                      {tramo.alumnos.toLocaleString("es-CL")} × UF{" "}
                      {formatearUF(plan.ufPorEstudiante)}
                      {tramo.descuento > 0 && (
                        <span className="ml-1 text-acento">
                          −{Math.round(tramo.descuento * 100)}%
                        </span>
                      )}
                    </span>
                    <span className="cifra text-white">
                      UF{" "}
                      {formatearUF(
                        Math.round(
                          tramo.alumnos * plan.ufPorEstudiante * (1 - tramo.descuento) * 10,
                        ) / 10,
                      )}
                    </span>
                  </li>
                ))}
                {red && (
                  <li className="flex items-baseline justify-between gap-3 border-t border-white/15 pt-1.5">
                    <span className="text-acento">
                      Descuento red de sostenedor −{Math.round(DESCUENTO_RED * 100)}%
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>

          <a
            href="#demo"
            className="mt-7 rounded-xl bg-white px-5 py-3 text-center text-sm font-semibold text-marca-700 shadow-suave transition-transform hover:-translate-y-0.5"
          >
            Cotizar formalmente
          </a>
          <p className="mt-3 text-[11px] leading-relaxed text-white/50">
            Valores netos, sin IVA. Los tramos son marginales: el descuento rige solo
            sobre los estudiantes de cada tramo, así que el precio nunca da saltos.
            Equivalencia en pesos con UF de {UF_REFERENCIA_FECHA} (
            {formatearCLP(UF_REFERENCIA_CLP)}); el contrato se expresa en UF.
          </p>
        </div>
      </div>

      {/* Tabla de tramos, para dirección que quiere ver la grilla completa */}
      <div className="border-t border-borde bg-superficie-2 px-6 py-5 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
          Tramos de descuento por volumen
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TRAMOS.map((tramo) => (
            <span
              key={tramo.etiqueta}
              className="rounded-lg border border-borde bg-superficie px-3 py-1.5 text-xs text-tinta-suave"
            >
              {tramo.etiqueta}
              <strong className="ml-1.5 font-semibold text-tinta">
                {tramo.descuento === 0 ? "precio de lista" : `−${Math.round(tramo.descuento * 100)}%`}
              </strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
