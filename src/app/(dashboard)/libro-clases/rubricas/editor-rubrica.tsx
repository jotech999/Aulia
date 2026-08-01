"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarRubrica, crearRubrica, generarRubricaConIA } from "./actions";
import { guardarRubricaSchema, type GuardarRubricaInput } from "@/lib/rubricas";
import { confirmar } from "@/components/ui/confirmar";
import { toast } from "@/components/ui/toast";
import { Boton } from "@/components/ui/boton";

export type AsignaturaEditorRubrica = {
  id: string;
  nombre: string;
  curso: string;
};

export type OaEditorRubrica = {
  codigo: string;
  eje: string;
  descripcion: string;
  asignaturaIds: string[];
};

type Props = {
  rubricaId?: string;
  inicial?: GuardarRubricaInput;
  asignaturas: AsignaturaEditorRubrica[];
  oas: OaEditorRubrica[];
  permiteGenerica: boolean;
  iaActiva?: boolean;
};

const campo =
  "mt-1 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm text-tinta outline-none transition focus:border-marca-500 focus:ring-2 focus:ring-marca-200 disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:text-tinta-tenue";

const nivelesRubrica = () => [
  { etiqueta: "Destacado", descriptor: "Supera consistentemente lo esperado.", puntaje: 4 },
  { etiqueta: "Logrado", descriptor: "Cumple con lo esperado.", puntaje: 3 },
  { etiqueta: "En proceso", descriptor: "Cumple parcialmente; requiere apoyo.", puntaje: 2 },
  { etiqueta: "Inicial", descriptor: "Aún no evidencia el desempeño esperado.", puntaje: 1 },
];

const nivelesPauta = () => [
  { etiqueta: "Logrado", descriptor: "Cumple el indicador.", puntaje: 1 },
  { etiqueta: "No logrado", descriptor: "Aún no cumple el indicador.", puntaje: 0 },
];

function estadoInicial(asignaturas: AsignaturaEditorRubrica[]): GuardarRubricaInput {
  return {
    asignaturaId: asignaturas[0]?.id ?? null,
    nombre: "",
    descripcion: "",
    tipo: "RUBRICA",
    oaCodigos: [],
    criterios: [
      {
        descripcion: "",
        peso: 1,
        niveles: nivelesRubrica(),
      },
    ],
  };
}

export function EditorRubrica({
  rubricaId,
  inicial,
  asignaturas,
  oas,
  permiteGenerica,
  iaActiva = false,
}: Props) {
  const router = useRouter();
  const [datos, setDatos] = useState<GuardarRubricaInput>(
    inicial ?? estadoInicial(asignaturas)
  );
  const [busquedaOa, setBusquedaOa] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descIA, setDescIA] = useState("");
  const [generandoIA, setGenerandoIA] = useState(false);

  // Genera el instrumento completo con IA y llena el editor (nada se guarda).
  async function generarConIA() {
    setError(null);
    setGenerandoIA(true);
    try {
      const asignatura = asignaturas.find((a) => a.id === datos.asignaturaId);
      const r = await generarRubricaConIA({
        descripcionEvaluacion: descIA,
        tipo: datos.tipo,
        contexto: asignatura ? `${asignatura.nombre} · ${asignatura.curso}` : undefined,
      });
      if (r.ok) {
        setDatos((actual) => ({
          ...actual,
          nombre: r.nombre,
          descripcion: r.descripcion,
          criterios: r.criterios,
        }));
        toast.exito("Instrumento generado. Revisa y ajusta antes de guardar.");
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    } finally {
      setGenerandoIA(false);
    }
  }

  const oasDisponibles = useMemo(() => {
    const consulta = busquedaOa.trim().toLocaleLowerCase("es");
    return oas.filter(
      (oa) =>
        (!datos.asignaturaId || oa.asignaturaIds.includes(datos.asignaturaId)) &&
        (!consulta ||
          oa.codigo.toLocaleLowerCase("es").includes(consulta) ||
          oa.descripcion.toLocaleLowerCase("es").includes(consulta) ||
          oa.eje.toLocaleLowerCase("es").includes(consulta))
    );
  }, [busquedaOa, datos.asignaturaId, oas]);

  function actualizarCriterio(indice: number, cambio: Partial<GuardarRubricaInput["criterios"][number]>) {
    setDatos((actual) => ({
      ...actual,
      criterios: actual.criterios.map((criterio, i) =>
        i === indice ? { ...criterio, ...cambio } : criterio
      ),
    }));
  }

  function actualizarNivel(
    criterioIndice: number,
    nivelIndice: number,
    cambio: Partial<GuardarRubricaInput["criterios"][number]["niveles"][number]>
  ) {
    const criterio = datos.criterios[criterioIndice];
    actualizarCriterio(criterioIndice, {
      niveles: criterio.niveles.map((nivel, i) =>
        i === nivelIndice ? { ...nivel, ...cambio } : nivel
      ),
    });
  }

  async function cambiarTipo(tipo: GuardarRubricaInput["tipo"]) {
    if (tipo === datos.tipo) return;
    const ok = await confirmar({
      titulo: "¿Cambiar el tipo de instrumento?",
      mensaje: "Los niveles actuales se reemplazarán por la estructura recomendada para el nuevo tipo.",
      textoConfirmar: "Cambiar tipo",
    });
    if (!ok) return;
    setDatos((actual) => ({
      ...actual,
      tipo,
      criterios: actual.criterios.map((criterio) => ({
        ...criterio,
        niveles: tipo === "PAUTA_COTEJO" ? nivelesPauta() : nivelesRubrica(),
      })),
    }));
  }

  function agregarCriterio() {
    setDatos((actual) => ({
      ...actual,
      criterios: [
        ...actual.criterios,
        {
          descripcion: "",
          peso: 1,
          niveles: actual.tipo === "PAUTA_COTEJO" ? nivelesPauta() : nivelesRubrica(),
        },
      ],
    }));
  }

  function quitarCriterio(indice: number) {
    if (datos.criterios.length === 1) return;
    setDatos((actual) => ({
      ...actual,
      criterios: actual.criterios.filter((_, i) => i !== indice),
    }));
  }

  function alternarOa(codigo: string) {
    setDatos((actual) => ({
      ...actual,
      oaCodigos: actual.oaCodigos.includes(codigo)
        ? actual.oaCodigos.filter((item) => item !== codigo)
        : [...actual.oaCodigos, codigo],
    }));
  }

  async function guardar() {
    const validacion = guardarRubricaSchema.safeParse(datos);
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Revisa los datos del instrumento.");
      return;
    }
    setGuardando(true);
    setError(null);
    if (rubricaId) {
      const resultado = await actualizarRubrica(rubricaId, validacion.data);
      setGuardando(false);
      if (!resultado.ok) {
        setError(resultado.error);
        toast.error(resultado.error);
        return;
      }
      toast.exito("Borrador guardado.");
      router.refresh();
      return;
    }

    const resultado = await crearRubrica(validacion.data);
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      toast.error(resultado.error);
      return;
    }
    toast.exito("Instrumento creado como borrador.");
    router.push(`/libro-clases/rubricas/${resultado.id}`);
  }

  return (
    <div className="space-y-5">
      {iaActiva && (
        <section
          className="rounded-xl border border-marca-200 bg-marca-50/70 p-4 sm:p-5"
          aria-labelledby="generar-ia"
        >
          <h2 id="generar-ia" className="font-display text-lg font-semibold text-marca-800">
            ✨ Generar con IA
          </h2>
          <p className="mt-0.5 text-sm text-marca-700">
            Describe la evaluación y la IA propone el instrumento completo
            ({datos.tipo === "PAUTA_COTEJO" ? "indicadores logrado / no logrado" : "criterios con 4 niveles de desempeño"}).
            Luego revisas y ajustas cada descriptor antes de guardar.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={descIA}
              onChange={(event) => setDescIA(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !generandoIA) void generarConIA();
              }}
              maxLength={1000}
              placeholder="Ej: Disertación sobre pueblos originarios de Chile, 5° básico, con apoyo visual"
              className="min-h-11 flex-1 rounded-lg border border-marca-200 bg-superficie px-3 py-2 text-sm"
              disabled={generandoIA}
            />
            <Boton type="button" disabled={generandoIA || descIA.trim().length < 10} onClick={() => void generarConIA()}>
              {generandoIA ? "Generando…" : "Generar instrumento"}
            </Boton>
          </div>
          {generandoIA && (
            <p className="mt-2 animate-pulse text-xs text-marca-700">
              Diseñando criterios y descriptores observables…
            </p>
          )}
        </section>
      )}

      <section className="superficie rounded-xl p-4 sm:p-5" aria-labelledby="datos-instrumento">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="datos-instrumento" className="font-display text-lg font-semibold text-tinta">
              Datos del instrumento
            </h2>
            <p className="mt-0.5 text-sm text-tinta-suave">
              Mantén el nombre breve y el propósito comprensible para otros docentes.
            </p>
          </div>
          <span className="rounded-full bg-alerta-suave px-3 py-1 text-xs font-semibold text-alerta">
            Borrador editable
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block text-sm font-medium text-tinta-suave lg:col-span-2">
            Nombre del instrumento
            <input
              value={datos.nombre}
              onChange={(event) => setDatos({ ...datos, nombre: event.target.value })}
              maxLength={160}
              placeholder="Ej: Presentación oral de investigación"
              className={campo}
            />
          </label>
          <label className="block text-sm font-medium text-tinta-suave">
            Tipo
            <select
              value={datos.tipo}
              onChange={(event) => void cambiarTipo(event.target.value as GuardarRubricaInput["tipo"])}
              className={campo}
            >
              <option value="RUBRICA">Rúbrica por niveles de desempeño</option>
              <option value="PAUTA_COTEJO">Pauta de cotejo</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-tinta-suave">
            Asignatura
            <select
              value={datos.asignaturaId ?? ""}
              onChange={(event) =>
                setDatos({ ...datos, asignaturaId: event.target.value || null, oaCodigos: [] })
              }
              className={campo}
            >
              {permiteGenerica && <option value="">Institucional / reutilizable</option>}
              {asignaturas.map((asignatura) => (
                <option key={asignatura.id} value={asignatura.id}>
                  {asignatura.nombre} · {asignatura.curso}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-tinta-suave lg:col-span-2">
            Descripción (opcional)
            <textarea
              value={datos.descripcion}
              onChange={(event) => setDatos({ ...datos, descripcion: event.target.value })}
              rows={3}
              maxLength={2000}
              placeholder="Indica el propósito y cuándo conviene usar este instrumento."
              className={campo}
            />
          </label>
        </div>
      </section>

      <section className="superficie rounded-xl p-4 sm:p-5" aria-labelledby="oas-instrumento">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="oas-instrumento" className="font-display text-lg font-semibold text-tinta">
              Objetivos de Aprendizaje
            </h2>
            <p className="mt-0.5 text-sm text-tinta-suave">Opcional. Vincula solo OA del nivel y asignatura elegidos.</p>
          </div>
          <span className="text-xs font-semibold text-marca-700">{datos.oaCodigos.length} seleccionados</span>
        </div>
        <input
          type="search"
          value={busquedaOa}
          onChange={(event) => setBusquedaOa(event.target.value)}
          placeholder="Buscar por código, eje o descripción"
          aria-label="Buscar Objetivos de Aprendizaje"
          className={`${campo} mt-4`}
        />
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-borde">
          {oasDisponibles.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-tinta-tenue">
              No hay OA disponibles para este contexto.
            </p>
          ) : (
            <ul className="divide-y divide-borde">
              {oasDisponibles.map((oa) => {
                const activo = datos.oaCodigos.includes(oa.codigo);
                return (
                  <li key={oa.codigo}>
                    <label className={`flex cursor-pointer gap-3 px-3 py-2.5 text-sm hover:bg-superficie-2 ${activo ? "bg-marca-50" : ""}`}>
                      <input
                        type="checkbox"
                        checked={activo}
                        onChange={() => alternarOa(oa.codigo)}
                        className="mt-0.5 h-4 w-4 accent-marca-600"
                      />
                      <span className="min-w-0">
                        <span className="font-semibold text-tinta">{oa.codigo}</span>
                        <span className="ml-2 text-xs text-tinta-tenue">{oa.eje}</span>
                        <span className="mt-0.5 block line-clamp-2 text-xs text-tinta-suave">{oa.descripcion}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="criterios-instrumento">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="criterios-instrumento" className="font-display text-lg font-semibold text-tinta">
              Criterios y niveles
            </h2>
            <p className="mt-0.5 text-sm text-tinta-suave">
              El peso es relativo. El resultado se conserva como puntaje, no como nota.
            </p>
          </div>
          <Boton type="button" variante="secundario" tamano="sm" onClick={agregarCriterio} disabled={datos.criterios.length >= 30}>
            + Agregar criterio
          </Boton>
        </div>

        <div className="space-y-4">
          {datos.criterios.map((criterio, criterioIndice) => (
            <article key={criterioIndice} className="superficie rounded-xl p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marca-50 text-xs font-bold text-marca-700">
                  {criterioIndice + 1}
                </span>
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_7rem]">
                  <label className="block text-sm font-medium text-tinta-suave">
                    Criterio observable
                    <input
                      value={criterio.descripcion}
                      onChange={(event) => actualizarCriterio(criterioIndice, { descripcion: event.target.value })}
                      maxLength={400}
                      placeholder="Ej: Fundamenta sus ideas con evidencia pertinente"
                      className={campo}
                    />
                  </label>
                  <label className="block text-sm font-medium text-tinta-suave">
                    Peso
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.25"
                      value={criterio.peso}
                      onChange={(event) => actualizarCriterio(criterioIndice, { peso: Number(event.target.value) })}
                      className={campo}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => quitarCriterio(criterioIndice)}
                  disabled={datos.criterios.length === 1}
                  className="mt-6 rounded-lg px-2 py-2 text-xs font-semibold text-peligro hover:bg-peligro-suave disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Quitar criterio ${criterioIndice + 1}`}
                >
                  Quitar
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {criterio.niveles.map((nivel, nivelIndice) => (
                  <div key={nivelIndice} className="grid gap-2 rounded-lg border border-borde bg-superficie-2 p-3 md:grid-cols-[10rem_1fr_6rem_auto] md:items-start">
                    <label className="text-xs font-medium text-tinta-suave">
                      Nivel {nivelIndice + 1}
                      <input
                        value={nivel.etiqueta}
                        onChange={(event) => actualizarNivel(criterioIndice, nivelIndice, { etiqueta: event.target.value })}
                        maxLength={80}
                        className={campo}
                      />
                    </label>
                    <label className="text-xs font-medium text-tinta-suave">
                      Descriptor
                      <textarea
                        value={nivel.descriptor}
                        onChange={(event) => actualizarNivel(criterioIndice, nivelIndice, { descriptor: event.target.value })}
                        rows={2}
                        maxLength={800}
                        className={campo}
                      />
                    </label>
                    <label className="text-xs font-medium text-tinta-suave">
                      Puntaje
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        step="0.25"
                        value={nivel.puntaje}
                        onChange={(event) => actualizarNivel(criterioIndice, nivelIndice, { puntaje: Number(event.target.value) })}
                        className={campo}
                      />
                    </label>
                    {datos.tipo === "RUBRICA" && (
                      <button
                        type="button"
                        onClick={() =>
                          actualizarCriterio(criterioIndice, {
                            niveles: criterio.niveles.filter((_, i) => i !== nivelIndice),
                          })
                        }
                        disabled={criterio.niveles.length <= 2}
                        className="mt-5 rounded-lg px-2 py-2 text-xs font-semibold text-peligro hover:bg-peligro-suave disabled:opacity-30"
                        aria-label={`Quitar nivel ${nivelIndice + 1} del criterio ${criterioIndice + 1}`}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
                {datos.tipo === "RUBRICA" && criterio.niveles.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      actualizarCriterio(criterioIndice, {
                        niveles: [
                          ...criterio.niveles,
                          { etiqueta: "Nuevo nivel", descriptor: "Describe el desempeño observable.", puntaje: 0 },
                        ],
                      })
                    }
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-marca-700 hover:bg-marca-50"
                  >
                    + Agregar nivel
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-superficie/95 p-3 shadow-elevada backdrop-blur">
        <div aria-live="polite" className="min-w-0 text-sm">
          {error ? (
            <p className="font-medium text-peligro">{error}</p>
          ) : (
            <p className="text-tinta-suave">Guarda el borrador antes de publicarlo.</p>
          )}
        </div>
        <Boton type="button" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : rubricaId ? "Guardar cambios" : "Crear borrador"}
        </Boton>
      </div>
    </div>
  );
}
