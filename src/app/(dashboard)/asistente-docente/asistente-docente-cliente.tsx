"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  generarBorrador,
  generarMaterial,
  materialAPdf,
  guardarMaterialEnBanco,
  eliminarMaterialDelBanco,
  corregirConIA,
  leerHojaDeRespuestas,
  leerPruebaEnPapel,
} from "./actions";
import type { MaterialGenerado } from "@/lib/ia/material";
import type { ResultadoCorreccion } from "@/lib/ia/correccion";
import { TomarFotos } from "@/components/ia/tomar-fotos";
import type { ImagenComprimida } from "@/lib/imagenes";

type Opcion = { id: string; etiqueta: string };
type MaterialBanco = {
  id: string;
  titulo: string;
  asignatura: string;
  nivel: string;
  tipoMaterial: string;
  creadoEn: string;
  contenido: MaterialGenerado;
};
type TipoBorrador = "planificacion" | "retroalimentacion" | "resumen-consejo" | "comunicado";
type Pestana = TipoBorrador | "material";

const PESTANAS: { tipo: Pestana; etiqueta: string; descripcion: string }[] = [
  { tipo: "material", etiqueta: "Guía / Evaluación", descripcion: "Material imprimible en PDF, con pauta de corrección" },
  { tipo: "planificacion", etiqueta: "Planificación", descripcion: "Unidad a partir de los OA del nivel" },
  { tipo: "retroalimentacion", etiqueta: "Retroalimentación", descripcion: "A un/a estudiante, tono formativo" },
  { tipo: "resumen-consejo", etiqueta: "Resumen consejo", descripcion: "Panorama del curso con datos agregados" },
  { tipo: "comunicado", etiqueta: "Comunicado", descripcion: "Mensaje para apoderados o comunidad" },
];

const campo =
  "mt-1 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";
const etiqueta = "block text-sm font-medium text-tinta-suave";

const LETRAS = ["a", "b", "c", "d", "e", "f"];

export function AsistenteDocente({
  disponible,
  asignaturas,
  cursos,
  banco = [],
}: {
  disponible: boolean;
  asignaturas: Opcion[];
  cursos: Opcion[];
  banco?: MaterialBanco[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<Pestana>("material");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [material, setMaterial] = useState<MaterialGenerado | null>(null);
  const [incluirPauta, setIncluirPauta] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [respuestas, setRespuestas] = useState("");
  // Lectura de la hoja en papel con la cámara.
  const [fotos, setFotos] = useState<ImagenComprimida[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [avisoFoto, setAvisoFoto] = useState<string | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  // Digitalizar una prueba antigua en papel para reutilizarla.
  const [fotosPrueba, setFotosPrueba] = useState<ImagenComprimida[]>([]);
  const [asignaturaPrueba, setAsignaturaPrueba] = useState("");
  const [digitalizando, setDigitalizando] = useState(false);
  const [avisoPrueba, setAvisoPrueba] = useState<string | null>(null);
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [correccion, setCorreccion] = useState<Extract<ResultadoCorreccion, { ok: true }> | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!disponible || cargando) return;
    setError(null);
    setCargando(true);
    setCopiado(false);
    const fd = new FormData(e.currentTarget);
    const input: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) input[k] = v;

    if (tipo === "material") {
      const res = await generarMaterial(input);
      setCargando(false);
      if (res.ok) setMaterial(res.material);
      else setError(res.error);
      return;
    }

    input.tipo = tipo;
    const res = await generarBorrador(input);
    setCargando(false);
    if (res.ok) setBorrador(res.borrador);
    else setError(res.error);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(borrador);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  }

  async function guardarEnBanco() {
    if (!material || guardando) return;
    setError(null);
    setGuardando(true);
    const res = await guardarMaterialEnBanco(material);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
    router.refresh();
  }

  function cargarDelBanco(m: MaterialBanco) {
    setMaterial(m.contenido);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function retirarDelBanco(id: string) {
    setError(null);
    const res = await eliminarMaterialDelBanco(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  /**
   * Digitaliza una prueba que ya existe en papel y la deja como material
   * editable: se puede imprimir, guardar en el banco o pasar a evaluación
   * online sin volver a escribirla.
   */
  async function digitalizarPrueba() {
    if (fotosPrueba.length === 0 || digitalizando) return;
    const opcion = asignaturas.find((a) => a.id === asignaturaPrueba);
    if (!opcion) {
      setErrorPrueba("Elige a qué asignatura corresponde la prueba.");
      return;
    }
    // La etiqueta viene como "5° Básico A · Matemática": el curso da el nivel.
    const [cursoTexto, asignaturaTexto] = opcion.etiqueta.split("·").map((t) => t.trim());
    setDigitalizando(true);
    setErrorPrueba(null);
    setAvisoPrueba(null);
    try {
      const res = await leerPruebaEnPapel({
        imagenes: fotosPrueba.map((f) => ({ base64: f.base64, tipo: f.tipo })),
        asignatura: asignaturaTexto || opcion.etiqueta,
        nivel: cursoTexto || "—",
      });
      if (res.ok) {
        setMaterial(res.material);
        setAvisoPrueba(res.aviso);
        setFotosPrueba([]);
      } else {
        setErrorPrueba(res.error);
      }
    } catch {
      setErrorPrueba("No se pudo leer la prueba. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setDigitalizando(false);
    }
  }

  /**
   * Lee la hoja fotografiada y VUELCA la transcripción al cuadro de texto, sin
   * corregir todavía. Ese paso intermedio es a propósito: la letra manuscrita
   * se lee mal a veces y una transcripción equivocada no puede transformarse en
   * una nota sin que nadie la haya mirado.
   */
  async function leerFotos() {
    if (fotos.length === 0 || leyendo) return;
    setLeyendo(true);
    setErrorFoto(null);
    setAvisoFoto(null);
    try {
      const res = await leerHojaDeRespuestas({
        imagenes: fotos.map((f) => ({ base64: f.base64, tipo: f.tipo })),
      });
      if (res.ok) {
        // Tope de 8000: es el máximo que acepta la corrección, y al fotografiar
        // varias tandas seguidas el texto acumulado lo superaba y el envío se
        // rechazaba sin explicar por qué.
        setRespuestas((previo) =>
          (previo.trim() ? `${previo.trim()}\n${res.texto}` : res.texto).slice(0, 8000)
        );
        setAvisoFoto(res.aviso);
        setFotos([]);
      } else {
        setErrorFoto(res.error);
      }
    } catch {
      setErrorFoto("No se pudo leer la foto. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setLeyendo(false);
    }
  }

  async function corregir() {
    if (!material || corrigiendo || respuestas.trim().length < 5) return;
    setError(null);
    setCorrigiendo(true);
    const res = await corregirConIA({ material, respuestas });
    setCorrigiendo(false);
    if (res.ok) setCorreccion(res);
    else setError(res.error);
  }

  async function descargarPdf() {
    if (!material || descargando) return;
    setError(null);
    setDescargando(true);
    const res = await materialAPdf({ material, incluirPauta });
    setDescargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // base64 → Blob → descarga en el navegador
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = res.nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!disponible) {
    return (
      <div className="rounded-xl border border-ambar-300/60 bg-ambar-50 px-5 py-4 text-sm text-tinta-suave">
        <p className="font-semibold text-tinta">La IA aún no está activada</p>
        <p className="mt-1">
          Para habilitar los borradores con IA, configura la variable <code className="rounded bg-superficie-2 px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code> en
          el servidor. Mientras tanto, esta herramienta permanece desactivada de forma segura.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Selector de tipo de herramienta */}
      <div role="tablist" className="flex flex-wrap gap-2">
        {PESTANAS.map((p) => (
          <button
            key={p.tipo}
            role="tab"
            aria-selected={tipo === p.tipo}
            type="button"
            onClick={() => {
              setTipo(p.tipo);
              setError(null);
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              tipo === p.tipo
                ? "border-marca-500 bg-marca-50 text-marca-700"
                : "border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-tinta-tenue">{PESTANAS.find((p) => p.tipo === tipo)?.descripcion}</p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {/* Formulario */}
        <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-borde bg-superficie p-4">
          {tipo === "material" && (
            <>
              <label className={etiqueta}>
                Tipo de material
                <select name="tipoMaterial" required className={campo} defaultValue="guia">
                  <option value="guia">Guía de ejercicios (práctica)</option>
                  <option value="evaluacion">Evaluación (con puntaje y nota)</option>
                </select>
              </label>
              <label className={etiqueta}>
                Asignatura
                <select name="asignaturaId" required className={campo} defaultValue="">
                  <option value="" disabled>
                    Selecciona una asignatura…
                  </option>
                  {asignaturas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label className={etiqueta}>
                Tema
                <input
                  name="tema"
                  required
                  maxLength={200}
                  placeholder="Ej: Fracciones equivalentes y comparación"
                  className={campo}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={etiqueta}>
                  N° de preguntas
                  <input name="numeroItems" type="number" min={3} max={20} defaultValue={8} required className={campo} />
                </label>
                <label className={etiqueta}>
                  Dificultad
                  <select name="dificultad" required className={campo} defaultValue="media">
                    <option value="basica">Básica</option>
                    <option value="media">Media</option>
                    <option value="avanzada">Avanzada</option>
                  </select>
                </label>
              </div>
              <span className="block text-xs text-tinta-tenue">
                Los ítems se alinean con los OA del nivel. El PDF incluye espacio para nombre, curso y fecha,
                y una pauta de corrección opcional en página aparte.
              </span>
            </>
          )}

          {tipo === "planificacion" && (
            <>
              <label className={etiqueta}>
                Asignatura
                <select name="asignaturaId" required className={campo} defaultValue="">
                  <option value="" disabled>
                    Selecciona una asignatura…
                  </option>
                  {asignaturas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label className={etiqueta}>
                Título de la unidad
                <input name="titulo" required maxLength={160} placeholder="Ej: Fracciones y decimales" className={campo} />
              </label>
              <label className={etiqueta}>
                Número de clases
                <input name="numeroClases" type="number" min={1} max={40} defaultValue={6} required className={campo} />
              </label>
            </>
          )}

          {tipo === "retroalimentacion" && (
            <>
              <label className={etiqueta}>
                Nombre de pila del/la estudiante
                <input name="nombrePila" required maxLength={60} placeholder="Ej: Martina" className={campo} />
              </label>
              <label className={etiqueta}>
                Área o asignatura
                <input name="area" required maxLength={80} placeholder="Ej: Comprensión lectora" className={campo} />
              </label>
              <label className={etiqueta}>
                Fortalezas observadas
                <textarea name="fortalezas" required rows={2} maxLength={1000} className={campo} />
              </label>
              <label className={etiqueta}>
                Aspectos a mejorar
                <textarea name="aspectos" required rows={2} maxLength={1000} className={campo} />
              </label>
            </>
          )}

          {tipo === "resumen-consejo" && (
            <label className={etiqueta}>
              Curso
              <select name="cursoId" required className={campo} defaultValue="">
                <option value="" disabled>
                  Selecciona un curso…
                </option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-tinta-tenue">
                Usa datos agregados del curso (asistencia, promedio, intervenciones). No expone datos individuales.
              </span>
            </label>
          )}

          {tipo === "comunicado" && (
            <>
              <label className={etiqueta}>
                Propósito
                <input name="proposito" required maxLength={200} placeholder="Ej: Reunión de apoderados" className={campo} />
              </label>
              <label className={etiqueta}>
                Destinatarios
                <input name="audiencia" required maxLength={120} placeholder="Ej: Apoderados de 5°B" className={campo} />
              </label>
              <label className={etiqueta}>
                Puntos a incluir
                <textarea name="puntos" required rows={4} maxLength={1500} placeholder="Fecha, hora, lugar, temas…" className={campo} />
              </label>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
              {error}
            </p>
          )}

          <button type="submit" disabled={cargando} className="btn btn-primario w-full">
            {cargando
              ? "Generando…"
              : tipo === "material"
                ? "Generar material"
                : "Generar borrador"}
          </button>
        </form>

        {/* Resultado */}
        {tipo === "material" ? (
          <div className="flex flex-col rounded-xl border border-borde bg-superficie p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-tinta-suave">Vista previa</span>
              {material && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-tinta-suave">
                    <input
                      type="checkbox"
                      checked={incluirPauta}
                      onChange={(e) => setIncluirPauta(e.target.checked)}
                      className="accent-marca-500"
                    />
                    Incluir pauta
                  </label>
                  <button
                    type="button"
                    onClick={guardarEnBanco}
                    disabled={guardando}
                    className="btn btn-fantasma px-3 py-1.5 text-xs"
                  >
                    {guardando ? "Guardando…" : guardado ? "¡Guardado!" : "Guardar en banco"}
                  </button>
                  <button
                    type="button"
                    onClick={descargarPdf}
                    disabled={descargando}
                    className="btn btn-primario px-3 py-1.5 text-xs"
                  >
                    {descargando ? "Preparando…" : "Descargar PDF"}
                  </button>
                </div>
              )}
            </div>

            {material ? (
              <div className="min-h-[320px] flex-1 space-y-3 overflow-y-auto rounded-lg border border-borde-fuerte bg-superficie-2 px-4 py-3 text-sm leading-relaxed text-tinta">
                <div>
                  <p className="font-display text-base font-bold">{material.titulo}</p>
                  <p className="text-xs text-tinta-tenue">
                    {material.asignatura} · {material.nivel}
                    {material.oaCodigos.length > 0 && ` · OA: ${material.oaCodigos.join(", ")}`}
                  </p>
                </div>
                <p className="text-xs italic text-tinta-suave">{material.instrucciones}</p>
                <ol className="space-y-2.5">
                  {material.items.map((item, i) => (
                    <li key={i}>
                      <p className="font-medium">
                        {i + 1}. {item.enunciado}{" "}
                        <span className="text-xs font-normal text-tinta-tenue">({item.puntaje} pts)</span>
                      </p>
                      {item.tipo === "seleccion" && item.alternativas && (
                        <ul className="mt-1 space-y-0.5 pl-4 text-tinta-suave">
                          {item.alternativas.map((alt, j) => (
                            <li key={j}>
                              {LETRAS[j]}) {alt}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.tipo === "verdadero_falso" && (
                        <p className="mt-0.5 pl-4 text-xs text-tinta-tenue">V ___ · F ___ (justificar)</p>
                      )}
                      {item.tipo === "desarrollo" && (
                        <p className="mt-0.5 pl-4 text-xs text-tinta-tenue">Respuesta de desarrollo</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-lg border border-dashed border-borde-fuerte bg-superficie-2 px-6 text-center text-sm text-tinta-tenue">
                Completa el formulario y genera una guía o evaluación. Aquí verás la vista previa antes de
                descargar el PDF listo para imprimir.
              </div>
            )}
            <p className="mt-2 text-[11px] leading-snug text-tinta-tenue">
              Generado por IA: puede contener errores. Revisa cada ítem y la pauta antes de imprimir y aplicar.
            </p>
          </div>
        ) : (
          <div className="flex flex-col rounded-xl border border-borde bg-superficie p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-tinta-suave">Borrador (editable)</span>
              {borrador && (
                <button type="button" onClick={copiar} className="text-xs font-medium text-marca-600 hover:text-marca-700">
                  {copiado ? "¡Copiado!" : "Copiar"}
                </button>
              )}
            </div>
            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              placeholder="El borrador aparecerá aquí. Podrás editarlo antes de usarlo."
              className="min-h-[320px] flex-1 resize-y rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm leading-relaxed text-tinta focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
            />
            <p className="mt-2 text-[11px] leading-snug text-tinta-tenue">
              Generado por IA: puede contener errores. Revísalo y edítalo antes de usarlo. Nada se envía ni
              se guarda automáticamente.
            </p>
          </div>
        )}
      </div>

      {/* Digitalizar una prueba que ya existe en papel */}
      {tipo === "material" && (
        <section className="mt-8 rounded-xl border border-borde bg-superficie p-4">
          <h2 className="font-display text-base font-semibold tracking-tight text-tinta">
            ¿Ya tienes la prueba en papel?
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-tinta-tenue">
            Fotografíala y Aulia la deja escrita aquí: podrás imprimirla, guardarla en el banco del
            colegio o corregirla con la cámara. Transcribe lo que hay en la hoja, sin inventar ni
            corregir el enunciado.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,18rem)_1fr]">
            <label className={etiqueta}>
              ¿De qué asignatura es?
              <select
                value={asignaturaPrueba}
                onChange={(e) => setAsignaturaPrueba(e.target.value)}
                className={campo}
              >
                <option value="" disabled>
                  Selecciona una asignatura…
                </option>
                {asignaturas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <TomarFotos
                fotos={fotosPrueba}
                onCambio={setFotosPrueba}
                deshabilitado={digitalizando}
                etiqueta="Fotografiar la prueba"
              />
              {fotosPrueba.length > 0 && (
                <button
                  type="button"
                  onClick={() => void digitalizarPrueba()}
                  disabled={digitalizando || !asignaturaPrueba}
                  className="mt-2 btn btn-primario"
                >
                  {digitalizando ? "Digitalizando…" : "Digitalizar la prueba"}
                </button>
              )}
              {errorPrueba && <p className="mt-1.5 text-xs text-peligro">{errorPrueba}</p>}
              {avisoPrueba && <p className="mt-1.5 text-xs text-alerta">{avisoPrueba}</p>}
            </div>
          </div>
        </section>
      )}

      {/* Corrección asistida por IA: respuestas del estudiante vs. pauta */}
      {tipo === "material" && material && (
        <section className="mt-8 rounded-xl border border-borde bg-superficie p-4">
          <h2 className="font-display text-base font-semibold tracking-tight text-tinta">
            Corrección asistida por IA
          </h2>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            Transcribe las respuestas de UN estudiante (ej: “1: b · 2: V · 3: porque la fracción…”).
            La IA propone puntajes contra la pauta de “{material.titulo}”. <strong>No incluyas el
            nombre del estudiante.</strong> Tú decides el puntaje final.
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="rounded-lg border border-marca-200 bg-marca-50 p-3">
                <p className="text-xs font-semibold text-marca-800">
                  ¿La prueba está en papel? Sácale una foto.
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-marca-700">
                  Aulia transcribe las respuestas al cuadro de abajo para que las revises antes de
                  corregir. No transcribe el nombre ni el RUT del estudiante.
                </p>
                <div className="mt-2">
                  <TomarFotos
                    fotos={fotos}
                    onCambio={setFotos}
                    deshabilitado={leyendo}
                    etiqueta="Fotografiar la hoja"
                  />
                </div>
                {fotos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void leerFotos()}
                    disabled={leyendo}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-marca-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-marca-700 disabled:opacity-60"
                  >
                    {leyendo ? "Leyendo la hoja…" : "Leer las respuestas de la foto"}
                  </button>
                )}
                {errorFoto && <p className="mt-1.5 text-xs text-peligro">{errorFoto}</p>}
                {avisoFoto && <p className="mt-1.5 text-xs text-alerta">{avisoFoto}</p>}
              </div>

              <textarea
                value={respuestas}
                onChange={(e) => setRespuestas(e.target.value)}
                rows={8}
                maxLength={8000}
                placeholder={"1: b\n2: V\n3: Porque al multiplicar numerador y denominador…"}
                className="flex-1 resize-y rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm leading-relaxed text-tinta focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
              />
              <button
                type="button"
                onClick={corregir}
                disabled={corrigiendo || respuestas.trim().length < 5}
                className="btn btn-primario"
              >
                {corrigiendo ? "Corrigiendo…" : "Proponer corrección"}
              </button>
            </div>
            <div className="rounded-lg border border-borde-fuerte bg-superficie-2 p-3">
              {correccion ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-tinta">Propuesta</span>
                    <span className="font-display text-lg font-bold tabular-nums text-tinta">
                      {correccion.total} / {correccion.maximoTotal} pts
                    </span>
                  </div>
                  <ol className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-sm">
                    {correccion.items.map((it) => (
                      <li key={it.numero} className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                            it.puntaje >= it.maximo
                              ? "bg-exito-suave text-exito"
                              : it.puntaje === 0
                                ? "bg-peligro-suave text-peligro"
                                : "bg-alerta-suave text-alerta"
                          }`}
                        >
                          {it.numero}. {it.puntaje}/{it.maximo}
                        </span>
                        <span className="text-xs leading-snug text-tinta-suave">{it.comentario}</span>
                      </li>
                    ))}
                  </ol>
                  {correccion.observacion && (
                    <p className="mt-2 rounded-lg bg-superficie px-3 py-2 text-xs italic text-tinta-suave">
                      {correccion.observacion}
                    </p>
                  )}
                </>
              ) : (
                <p className="flex h-full min-h-32 items-center justify-center text-center text-sm text-tinta-tenue">
                  La propuesta de corrección aparecerá aquí, ítem por ítem con justificación.
                </p>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-tinta-tenue">
            Propuesta generada por IA: puede contener errores. Revisa cada puntaje antes de
            registrar la nota. Nada se guarda automáticamente.
          </p>
        </section>
      )}

      {/* Banco de material del colegio: guías/evaluaciones guardadas y compartidas */}
      {tipo === "material" && banco.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold tracking-tight text-tinta">
            Banco del colegio
          </h2>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            Material guardado por el equipo docente. Cárgalo para revisarlo, editarlo o imprimirlo.
          </p>
          <ul className="mt-3 space-y-2">
            {banco.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-borde bg-superficie p-3.5"
              >
                <span
                  className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                    m.tipoMaterial === "evaluacion"
                      ? "bg-marca-50 text-marca-700"
                      : "bg-superficie-3 text-tinta-suave"
                  }`}
                >
                  {m.tipoMaterial === "evaluacion" ? "Evaluación" : "Guía"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-tinta">{m.titulo}</p>
                  <p className="text-xs text-tinta-tenue">
                    {m.asignatura} · {m.nivel} ·{" "}
                    {new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(
                      new Date(m.creadoEn)
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cargarDelBanco(m)}
                  className="shrink-0 text-xs font-medium text-marca-600 hover:text-marca-700"
                >
                  Cargar
                </button>
                <button
                  type="button"
                  onClick={() => retirarDelBanco(m.id)}
                  className="shrink-0 text-xs font-medium text-tinta-tenue hover:text-peligro"
                >
                  Retirar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
