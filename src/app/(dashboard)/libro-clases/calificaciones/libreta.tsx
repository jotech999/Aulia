"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calcularPromedio,
  esNotaValida,
  NOTA_APROBACION,
  promedioGeneral,
  type ItemPromedio,
} from "@/lib/calificaciones";
import {
  comentarioEstudianteIA,
  crearEvaluacion,
  editarEvaluacion,
  eliminarEvaluacion,
  guardarCalificacion,
  guardarCalificacionesLote,
} from "./actions";
import { toast } from "@/components/ui/toast";
import { confirmar } from "@/components/ui/confirmar";

type Estudiante = { id: string; nombre: string };
type Evaluacion = {
  id: string;
  nombre: string;
  tipo: "SUMATIVA" | "FORMATIVA";
  ponderacion: number;
  fecha: string;
};
type Calif = {
  evaluacionId: string;
  estudianteId: string;
  nota: number | null;
  eximida: boolean;
};

type Celda = { nota: number | null; eximida: boolean };
type EstadoCelda = "guardado" | "guardando" | "error";

const clave = (evId: string, estId: string) => `${evId}|${estId}`;

/** Interpreta el texto de una celda: "" = pendiente, "e"/"ex" = eximido, número = nota. */
function parsearCelda(
  texto: string
): { ok: true; celda: Celda } | { ok: false } {
  const t = texto.trim().toLowerCase().replace(",", ".");
  if (t === "") return { ok: true, celda: { nota: null, eximida: false } };
  if (t === "e" || t === "ex") return { ok: true, celda: { nota: null, eximida: true } };
  const n = Number(t);
  if (!Number.isNaN(n) && esNotaValida(n)) {
    return { ok: true, celda: { nota: n, eximida: false } };
  }
  return { ok: false };
}

function textoCelda(c: Celda | undefined): string {
  if (!c) return "";
  if (c.eximida) return "Ex";
  return c.nota === null ? "" : String(c.nota);
}

export function Libreta({
  asignaturaId,
  periodo,
  estudiantes,
  evaluaciones,
  calificaciones,
  densidad = "comodo",
  iaActiva = false,
}: {
  asignaturaId: string;
  periodo: number;
  estudiantes: Estudiante[];
  evaluaciones: Evaluacion[];
  calificaciones: Calif[];
  densidad?: "comodo" | "compacto";
  iaActiva?: boolean;
}) {
  const router = useRouter();
  const compacto = densidad === "compacto";
  const filaY = compacto ? "py-1" : "py-1.5";
  const inputAlto = compacto ? "h-8" : "h-9";

  const [celdas, setCeldas] = useState<Record<string, Celda>>(() =>
    Object.fromEntries(
      calificaciones.map((c) => [
        clave(c.evaluacionId, c.estudianteId),
        { nota: c.nota, eximida: c.eximida },
      ])
    )
  );
  const [estados, setEstados] = useState<Record<string, EstadoCelda>>({});
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [colMenu, setColMenu] = useState<string | null>(null);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  // Retroalimentación IA por estudiante (borrador editable, no se guarda solo).
  const [retro, setRetro] = useState<{
    estId: string;
    nombre: string;
    estado: "cargando" | "listo" | "error";
    texto: string;
  } | null>(null);
  const grid = useRef<HTMLTableElement>(null);
  // Pila de deshacer: cada paso es un grupo de celdas (un pegado = un paso).
  const undoStack = useRef<{ evId: string; estId: string; prev: Celda }[][]>([]);

  const colDe = useMemo(() => new Map(evaluaciones.map((e, i) => [e.id, i])), [evaluaciones]);
  const filaDe = useMemo(() => new Map(estudiantes.map((e, i) => [e.id, i])), [estudiantes]);

  function setInputDOM(evId: string, estId: string, texto: string) {
    const input = grid.current?.querySelector<HTMLInputElement>(
      `input[data-fila="${filaDe.get(estId)}"][data-col="${colDe.get(evId)}"]`
    );
    if (input) input.value = texto;
  }

  function pushUndo(cells: { evId: string; estId: string; prev: Celda }[]) {
    if (!cells.length) return;
    undoStack.current.push(cells);
    if (undoStack.current.length > 50) undoStack.current.shift();
    setPuedeDeshacer(true);
  }

  function marcaEstado(cells: { evId: string; estId: string }[], estado: EstadoCelda) {
    setEstados((s) => {
      const n = { ...s };
      for (const c of cells) n[clave(c.evId, c.estId)] = estado;
      return n;
    });
  }

  /** Guarda un conjunto de celdas en una sola llamada (pegado / deshacer). */
  async function guardarLote(cells: { evId: string; estId: string; celda: Celda }[]) {
    marcaEstado(cells, "guardando");
    const res = await guardarCalificacionesLote({
      asignaturaId,
      celdas: cells.map((c) => ({
        evaluacionId: c.evId,
        estudianteId: c.estId,
        nota: c.celda.eximida ? null : c.celda.nota,
        eximida: c.celda.eximida,
      })),
    });
    marcaEstado(cells, res.ok ? "guardado" : "error");
  }

  function deshacer() {
    const paso = undoStack.current.pop();
    if (!paso) return;
    if (!undoStack.current.length) setPuedeDeshacer(false);
    setCeldas((c) => {
      const n = { ...c };
      for (const cel of paso) n[clave(cel.evId, cel.estId)] = cel.prev;
      return n;
    });
    for (const cel of paso) setInputDOM(cel.evId, cel.estId, textoCelda(cel.prev));
    void guardarLote(paso.map((cel) => ({ evId: cel.evId, estId: cel.estId, celda: cel.prev })));
  }

  /** Pegado desde Excel: rellena un bloque de celdas desde la celda ancla. */
  function onPasteCelda(
    e: React.ClipboardEvent<HTMLInputElement>,
    filaBase: number,
    colBase: number
  ) {
    const texto = e.clipboardData.getData("text");
    // Solo interceptamos pegados de varias celdas (tabuladas o multilínea).
    if (!texto || (!texto.includes("\t") && !texto.includes("\n"))) return;
    e.preventDefault();
    const filas = texto.replace(/\r/g, "").replace(/\n+$/, "").split("\n");
    const cambios: { evId: string; estId: string; celda: Celda; prev: Celda }[] = [];
    filas.forEach((filaTxt, r) => {
      filaTxt.split("\t").forEach((valor, c) => {
        const f = filaBase + r;
        const col = colBase + c;
        if (f >= estudiantes.length || col >= evaluaciones.length) return;
        const parsed = parsearCelda(valor);
        if (!parsed.ok) return; // celda ilegible: se ignora
        const est = estudiantes[f];
        const ev = evaluaciones[col];
        const prev = celdas[clave(ev.id, est.id)] ?? { nota: null, eximida: false };
        if (prev.nota === parsed.celda.nota && prev.eximida === parsed.celda.eximida) return;
        cambios.push({ evId: ev.id, estId: est.id, celda: parsed.celda, prev });
      });
    });
    if (!cambios.length) return;
    setCeldas((prevC) => {
      const n = { ...prevC };
      for (const c of cambios) n[clave(c.evId, c.estId)] = c.celda;
      return n;
    });
    for (const c of cambios) setInputDOM(c.evId, c.estId, textoCelda(c.celda));
    pushUndo(cambios.map((c) => ({ evId: c.evId, estId: c.estId, prev: c.prev })));
    void guardarLote(cambios.map((c) => ({ evId: c.evId, estId: c.estId, celda: c.celda })));
    toast.exito(`${cambios.length} nota(s) pegada(s).`, { accion: { etiqueta: "Deshacer", onClick: deshacer } });
  }

  const promedios = useMemo(() => {
    const out: Record<string, ReturnType<typeof calcularPromedio>> = {};
    for (const est of estudiantes) {
      const items: ItemPromedio[] = evaluaciones.map((ev) => {
        const c = celdas[clave(ev.id, est.id)];
        return {
          nota: c?.eximida ? null : c?.nota ?? null,
          ponderacion: ev.ponderacion,
          // Las formativas y las eximidas no promedian.
          computa: ev.tipo === "SUMATIVA" && !c?.eximida,
        };
      });
      out[est.id] = calcularPromedio(items);
    }
    return out;
  }, [celdas, estudiantes, evaluaciones]);

  const sumaPonderaciones = evaluaciones
    .filter((e) => e.tipo === "SUMATIVA")
    .reduce((s, e) => s + e.ponderacion, 0);

  // Resumen EN VIVO del curso: promedio general y distribución por bandas de
  // rendimiento. Se recalcula con cada nota que la persona docente ingresa.
  const promediosLista = estudiantes
    .map((e) => promedios[e.id]?.promedio)
    .filter((p): p is number => p != null);
  // Mismo cálculo que la tarjeta "Promedio del curso" de la página: media
  // simple CON la aproximación a la décima del Decreto 67. Antes acá se hacía
  // una media cruda, y la pantalla mostraba dos promedios distintos (5,2 y 5,3)
  // a cuatro centímetros uno del otro.
  const promedioCurso = promedioGeneral(promediosLista);
  // Rampa semántica sobre los tokens del sistema de diseño. Antes usaba colores
  // crudos de Tailwind (sky-500, emerald-500), heredados de la marca azul: el
  // gráfico de arriba y esta franja pintaban los MISMOS cuatro números con dos
  // paletas distintas. Los rellenos usan el tono -vivo y el texto el tono base,
  // que es el que cumple contraste.
  const bandasRendimiento = [
    { etiqueta: "1.0–3.9", barra: "bg-peligro-vivo", texto: "text-peligro", en: (p: number) => p < 4 },
    { etiqueta: "4.0–4.9", barra: "bg-alerta-vivo", texto: "text-alerta", en: (p: number) => p >= 4 && p < 5 },
    { etiqueta: "5.0–5.9", barra: "bg-marca-400", texto: "text-marca-700", en: (p: number) => p >= 5 && p < 6 },
    { etiqueta: "6.0–7.0", barra: "bg-exito-vivo", texto: "text-exito", en: (p: number) => p >= 6 },
  ].map((b) => ({ ...b, n: promediosLista.filter(b.en).length }));

  async function persistir(evId: string, estId: string, celda: Celda) {
    const k = clave(evId, estId);
    setEstados((e) => ({ ...e, [k]: "guardando" }));
    const res = await guardarCalificacion({
      evaluacionId: evId,
      estudianteId: estId,
      nota: celda.eximida ? null : celda.nota,
      eximida: celda.eximida,
    });
    setEstados((e) => ({ ...e, [k]: res.ok ? "guardado" : "error" }));
  }

  /** Guarda una celda al perder foco; devuelve el paso de undo si cambió. */
  function commitCelda(
    evId: string,
    estId: string,
    texto: string
  ): { evId: string; estId: string; prev: Celda } | null {
    const k = clave(evId, estId);
    const parsed = parsearCelda(texto);
    if (!parsed.ok) {
      setEstados((e) => ({ ...e, [k]: "error" }));
      return null;
    }
    const previa = celdas[k] ?? { nota: null, eximida: false };
    const nueva = parsed.celda;
    if (previa.nota === nueva.nota && previa.eximida === nueva.eximida) {
      // Sin cambios: limpia estado de error si lo hubiera.
      setEstados((e) => ({ ...e, [k]: "guardado" }));
      return null;
    }
    setCeldas((c) => ({ ...c, [k]: nueva }));
    void persistir(evId, estId, nueva);
    return { evId, estId, prev: previa };
  }

  function onBlurCelda(evId: string, estId: string, texto: string) {
    const cambio = commitCelda(evId, estId, texto);
    if (cambio) pushUndo([cambio]);
  }

  /** Navegación con teclado entre celdas de la grilla (flechas + Enter). */
  function onKeyDownCelda(
    ev: React.KeyboardEvent<HTMLInputElement>,
    fila: number,
    col: number
  ) {
    // Ctrl/Cmd+Z: deshacer el último cambio de celda (o el último pegado).
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      deshacer();
      return;
    }
    const mover = (df: number, dc: number) => {
      ev.preventDefault();
      const sel = grid.current?.querySelector<HTMLInputElement>(
        `input[data-fila="${fila + df}"][data-col="${col + dc}"]`
      );
      sel?.focus();
      sel?.select();
    };
    switch (ev.key) {
      case "ArrowDown":
      case "Enter":
        mover(1, 0);
        break;
      case "ArrowUp":
        mover(-1, 0);
        break;
      case "ArrowLeft":
        if ((ev.target as HTMLInputElement).selectionStart === 0) mover(0, -1);
        break;
      case "ArrowRight":
        if (
          (ev.target as HTMLInputElement).selectionStart ===
          (ev.target as HTMLInputElement).value.length
        )
          mover(0, 1);
        break;
    }
  }

  async function onCrearEvaluacion(form: FormData) {
    const res = await crearEvaluacion({
      asignaturaId,
      nombre: String(form.get("nombre") ?? ""),
      tipo: String(form.get("tipo") ?? "SUMATIVA"),
      ponderacion: Number(form.get("ponderacion") ?? 0),
      periodo,
      fecha: String(form.get("fecha") ?? ""),
      contenidos: String(form.get("contenidos") ?? ""),
    });
    if (res.ok) {
      setNuevaAbierta(false);
      toast.exito("Evaluación creada.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function onEliminar(evId: string) {
    const ev = evaluaciones.find((e) => e.id === evId);
    const ok = await confirmar({
      titulo: `¿Eliminar "${ev?.nombre ?? "esta evaluación"}"?`,
      mensaje: "Se elimina la columna y todas sus notas (queda registrado). No se puede deshacer.",
      textoConfirmar: "Eliminar",
      peligro: true,
    });
    if (!ok) return;
    const res = await eliminarEvaluacion(asignaturaId, evId);
    setColMenu(null);
    if (res.ok) {
      toast.exito("Evaluación eliminada.");
      router.refresh();
    } else toast.error(res.error);
  }

  async function onEditar(evId: string, form: FormData) {
    const ev = evaluaciones.find((e) => e.id === evId);
    if (!ev) return;
    const res = await editarEvaluacion({
      evaluacionId: evId,
      asignaturaId,
      nombre: String(form.get("nombre") ?? ev.nombre),
      tipo: String(form.get("tipo") ?? ev.tipo),
      ponderacion: Number(form.get("ponderacion") ?? ev.ponderacion),
      periodo,
      fecha: ev.fecha,
    });
    setColMenu(null);
    if (res.ok) {
      toast.exito("Evaluación actualizada.");
      router.refresh();
    } else toast.error(res.error);
  }

  // Genera el comentario de retroalimentación IA de un estudiante (borrador).
  async function generarRetro(est: Estudiante) {
    setRetro({ estId: est.id, nombre: est.nombre, estado: "cargando", texto: "" });
    const r = await comentarioEstudianteIA({ asignaturaId, estudianteId: est.id });
    setRetro(
      r.ok
        ? { estId: est.id, nombre: est.nombre, estado: "listo", texto: r.borrador }
        : { estId: est.id, nombre: est.nombre, estado: "error", texto: r.error }
    );
  }

  async function copiarRetro() {
    if (!retro || retro.estado !== "listo") return;
    try {
      await navigator.clipboard.writeText(retro.texto);
      toast.exito("Comentario copiado.");
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y copia manualmente.");
    }
  }

  return (
    <div className="mt-4">
      {puedeDeshacer && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={deshacer}
            className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-2.5 py-1.5 text-xs font-semibold text-tinta-suave hover:bg-superficie-2"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
              <path d="M8 5L4 9l4 4" />
              <path d="M4 9h9a4 4 0 010 8h-1" />
            </svg>
            Deshacer <span className="text-tinta-tenue">(Ctrl+Z)</span>
          </button>
        </div>
      )}
      {evaluaciones.length > 0 && sumaPonderaciones !== 100 && (
        <p className="mb-2 text-xs text-alerta">
          Las ponderaciones sumativas suman {sumaPonderaciones}
          {sumaPonderaciones === Math.round(sumaPonderaciones) ? "" : ""} (no
          necesariamente 100): el promedio se calcula sobre la suma real.
        </p>
      )}

      {/* Mini-dashboard en vivo: promedio del curso + distribución por bandas */}
      {promediosLista.length > 0 && (
        <div className="mb-3 rounded-xl border border-borde bg-superficie px-4 py-3 text-sm shadow-suave">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {bandasRendimiento.map((b) => (
              <span key={b.etiqueta} className={`inline-flex items-center gap-1.5 font-semibold ${b.texto}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${b.barra}`} aria-hidden />
                {b.n} <span className="font-normal text-tinta-tenue">({b.etiqueta})</span>
              </span>
            ))}
            <span className="ml-auto flex items-baseline gap-2">
              {promedioCurso !== null && (
                <span
                  className={`font-display text-lg font-bold leading-none tabular-nums ${
                    promedioCurso < 4 ? "text-peligro" : "text-tinta"
                  }`}
                  aria-label={`Promedio del curso: ${promedioCurso.toFixed(1)}`}
                >
                  {promedioCurso.toFixed(1)}
                </span>
              )}
              <span className="text-xs text-tinta-tenue">
                promedio · {promediosLista.length} con nota
              </span>
            </span>
          </div>
          <div
            className="mt-2.5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={`Distribución de promedios: ${bandasRendimiento
              .filter((b) => b.n > 0)
              .map((b) => `${b.n} en ${b.etiqueta}`)
              .join(", ")}`}
          >
            {bandasRendimiento
              .filter((b) => b.n > 0)
              .map((b) => (
                <span
                  key={b.etiqueta}
                  className={`h-full rounded-full transition-all duration-300 ${b.barra}`}
                  style={{ width: `${(b.n / promediosLista.length) * 100}%` }}
                />
              ))}
          </div>
        </div>
      )}

      {/*
        La grilla scrollea dentro de su propio marco (no con la página) para que
        el encabezado de columnas quede fijo arriba. Antes, al bajar a los
        estudiantes del final desaparecían los títulos de las evaluaciones y se
        escribían notas sin saber a qué columna correspondían.
      */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-borde bg-superficie shadow-suave">
        <table ref={grid} className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2">
              <th className="sticky left-0 top-0 z-30 min-w-[15rem] bg-superficie-2 px-3 py-2 text-left text-xs font-semibold uppercase text-tinta-tenue">
                Estudiante
              </th>
              {evaluaciones.map((ev) => (
                <th
                  key={ev.id}
                  className="sticky top-0 z-20 relative min-w-[5.5rem] bg-superficie-2 px-2 py-2 text-center align-bottom"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setColMenu((c) => (c === ev.id ? null : ev.id))
                    }
                    className="mx-auto flex max-w-[8rem] flex-col items-center gap-0.5"
                    title={`${ev.nombre} — clic para editar`}
                  >
                    {/* Dos líneas en vez de cortar: "Trabajo de investigación"
                        se leía "Trabajo de investigació", sin la última letra. */}
                    <span className="line-clamp-2 text-xs font-semibold leading-tight text-tinta">
                      {ev.nombre}
                    </span>
                    <span className="text-[10px] font-medium text-tinta-tenue">
                      {ev.tipo === "FORMATIVA" ? "Formativa" : `×${ev.ponderacion}`}
                    </span>
                  </button>

                  {colMenu === ev.id && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-borde bg-superficie p-3 text-left shadow-elevada">
                      <form
                        action={(fd) => onEditar(ev.id, fd)}
                        className="space-y-2"
                      >
                        <label className="block text-[11px] font-medium text-tinta-tenue">
                          Nombre
                          <input
                            name="nombre"
                            defaultValue={ev.nombre}
                            className="mt-0.5 w-full rounded-lg border border-borde px-2 py-1 text-sm"
                          />
                        </label>
                        <div className="flex gap-2">
                          <label className="block flex-1 text-[11px] font-medium text-tinta-tenue">
                            Ponderación
                            <input
                              name="ponderacion"
                              type="number"
                              step="1"
                              min="1"
                              defaultValue={ev.ponderacion}
                              className="mt-0.5 w-full rounded-lg border border-borde px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="block flex-1 text-[11px] font-medium text-tinta-tenue">
                            Tipo
                            <select
                              name="tipo"
                              defaultValue={ev.tipo}
                              className="mt-0.5 w-full rounded-lg border border-borde px-2 py-1 text-sm"
                            >
                              <option value="SUMATIVA">Sumativa</option>
                              <option value="FORMATIVA">Formativa</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => onEliminar(ev.id)}
                            className="text-xs font-medium text-peligro hover:underline"
                          >
                            Eliminar
                          </button>
                          <button type="submit" className="btn btn-primario btn-sm">
                            Guardar
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </th>
              ))}
              <th className="sticky top-0 z-20 bg-superficie-2 px-3 py-2 text-center text-xs font-semibold uppercase text-tinta-tenue">
                Promedio
              </th>
              <th className="sticky top-0 z-20 bg-superficie-2 px-2 py-2">
                <button
                  type="button"
                  onClick={() => setNuevaAbierta((v) => !v)}
                  className="rounded-lg border border-dashed border-borde-fuerte px-2 py-1 text-xs font-medium text-tinta-tenue hover:border-borde-fuerte hover:text-tinta"
                >
                  + Evaluación
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {estudiantes.map((est, fila) => {
              const prom = promedios[est.id];
              return (
                <tr key={est.id} className="border-b border-borde last:border-0">
                  {/*
                    Sin truncar: en un curso con tres Castillo y tres Soto, cortar
                    el nombre de pila hace que se pueda poner una nota en la fila
                    equivocada. Se permite que baje a dos líneas.
                  */}
                  <td
                    title={est.nombre}
                    className={`sticky left-0 z-10 min-w-[15rem] max-w-[20rem] bg-superficie px-3 ${filaY} font-medium leading-snug text-tinta`}
                  >
                    {est.nombre}
                  </td>
                  {evaluaciones.map((ev, col) => {
                    const k = clave(ev.id, est.id);
                    const estadoCelda = estados[k];
                    const reprobada =
                      celdas[k]?.nota !== null &&
                      celdas[k]?.nota !== undefined &&
                      !celdas[k]?.eximida &&
                      (celdas[k]!.nota as number) < NOTA_APROBACION;
                    return (
                      <td key={ev.id} className="px-1 py-1 text-center">
                        <input
                          data-fila={fila}
                          data-col={col}
                          defaultValue={textoCelda(celdas[k])}
                          inputMode="decimal"
                          aria-label={`${est.nombre} — ${ev.nombre}`}
                          onKeyDown={(e) => onKeyDownCelda(e, fila, col)}
                          onFocus={(e) => e.currentTarget.select()}
                          onPaste={(e) => onPasteCelda(e, fila, col)}
                          onBlur={(e) => onBlurCelda(ev.id, est.id, e.target.value)}
                          className={`${inputAlto} w-14 rounded-lg border text-center tabular-nums outline-none transition-colors focus:ring-2 focus:ring-marca-500/40 ${
                            estadoCelda === "error"
                              ? "border-peligro bg-peligro-suave text-peligro"
                              : reprobada
                                ? "border-peligro/40 bg-peligro-suave font-semibold text-peligro"
                                : "border-borde text-tinta"
                          } ${
                            estadoCelda === "guardando"
                              ? "celda-guardando"
                              : estadoCelda === "guardado"
                                ? "celda-guardada"
                                : ""
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className={`px-3 ${filaY} text-center`}>
                    {prom.promedio === null ? (
                      <span className="text-tinta-tenue">—</span>
                    ) : (
                      <span
                        className={`inline-block min-w-[2.5rem] rounded-lg px-2 py-0.5 font-bold tabular-nums ${
                          prom.reprobatorio
                            ? "bg-peligro-suave text-peligro"
                            : "bg-exito-suave text-exito"
                        }`}
                        title={
                          prom.reprobatorio
                            ? "Promedio reprobatorio (bajo 4.0)"
                            : undefined
                        }
                      >
                        {prom.promedio.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="px-1 text-center">
                    {iaActiva && prom.promedio !== null && (
                      <button
                        type="button"
                        onClick={() => void generarRetro(est)}
                        disabled={retro?.estado === "cargando"}
                        title={`Comentario de retroalimentación con IA para ${est.nombre}`}
                        aria-label={`Comentario de retroalimentación con IA para ${est.nombre}`}
                        className="rounded-lg px-1.5 py-0.5 text-sm opacity-60 transition-opacity hover:bg-marca-50 hover:opacity-100"
                      >
                        ✨
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-tinta-tenue">
        Escribe la nota y presiona Enter o usa las flechas para moverte. Deja la
        celda vacía para dejarla pendiente, o escribe <strong>E</strong> para
        eximir. Puedes <strong>pegar desde Excel</strong> (una columna o un bloque)
        y <strong>deshacer</strong> con Ctrl+Z. Cada cambio se guarda solo y queda registrado.
        {iaActiva && (
          <>
            {" "}Con <strong>✨</strong> al final de cada fila obtienes un borrador de
            retroalimentación del estudiante.
          </>
        )}
      </p>

      {retro && (
        <section
          aria-label={`Retroalimentación para ${retro.nombre}`}
          className="mt-4 rounded-xl border border-marca-200 bg-marca-50/70 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-marca-800">
              ✨ Retroalimentación · {retro.nombre}
            </p>
            <button
              type="button"
              onClick={() => setRetro(null)}
              className="text-sm text-tinta-tenue hover:text-tinta"
              aria-label="Cerrar retroalimentación"
            >
              ✕
            </button>
          </div>
          {retro.estado === "cargando" && (
            <p className="mt-2 animate-pulse text-sm text-marca-700">
              Analizando notas y asistencia…
            </p>
          )}
          {retro.estado === "error" && (
            <p className="mt-2 text-sm text-peligro">{retro.texto}</p>
          )}
          {retro.estado === "listo" && (
            <>
              <textarea
                value={retro.texto}
                onChange={(e) => setRetro({ ...retro, texto: e.target.value })}
                rows={5}
                className="mt-2 w-full rounded-lg border border-marca-200 bg-superficie px-3 py-2 text-sm leading-relaxed"
                aria-label="Borrador de retroalimentación (editable)"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void copiarRetro()} className="btn btn-primario btn-sm">
                  Copiar comentario
                </button>
                <span className="text-xs text-marca-700">
                  Es un borrador: revísalo y edítalo antes de usarlo en informes o entrevistas.
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {evaluaciones.length === 0 && !nuevaAbierta && (
        <div className="mt-6 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
          Aún no hay evaluaciones en este periodo.{" "}
          <button
            type="button"
            onClick={() => setNuevaAbierta(true)}
            className="font-medium text-tinta underline"
          >
            Crea la primera
          </button>
          .
        </div>
      )}

      {nuevaAbierta && (
        <form
          action={onCrearEvaluacion}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4 shadow-suave"
        >
          <label className="text-xs font-medium text-tinta-tenue">
            Nombre
            <input
              name="nombre"
              required
              placeholder="Prueba unidad 1"
              className="mt-0.5 block w-48 rounded-lg border border-borde px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-tinta-tenue">
            Ponderación
            <input
              name="ponderacion"
              type="number"
              step="1"
              min="1"
              defaultValue={30}
              required
              className="mt-0.5 block w-24 rounded-lg border border-borde px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-tinta-tenue">
            Tipo
            <select
              name="tipo"
              defaultValue="SUMATIVA"
              className="mt-0.5 block w-28 rounded-lg border border-borde px-2 py-1.5 text-sm"
            >
              <option value="SUMATIVA">Sumativa</option>
              <option value="FORMATIVA">Formativa</option>
            </select>
          </label>
          <label className="text-xs font-medium text-tinta-tenue">
            Fecha
            <input
              name="fecha"
              type="date"
              required
              className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
            />
          </label>
          <label className="w-full text-xs font-medium text-tinta-tenue">
            Contenido (qué entra — lo ven los apoderados)
            <textarea
              name="contenidos"
              rows={2}
              maxLength={1000}
              placeholder="Unidades, temas, habilidades…"
              className="mt-0.5 block w-full resize-y rounded-lg border border-borde px-2 py-1.5 text-sm"
            />
          </label>
          <button type="submit" className="btn btn-primario">
            Agregar
          </button>
          <button
            type="button"
            onClick={() => setNuevaAbierta(false)}
            className="text-sm text-tinta-tenue hover:text-tinta"
          >
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
}
