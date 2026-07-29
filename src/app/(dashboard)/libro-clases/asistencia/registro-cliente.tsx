"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoAsistencia } from "@/lib/asistencia";
import { ESTADOS_ASISTENCIA } from "@/lib/asistencia";
import { guardarAsistencia, guardarAsistenciaBloque } from "./actions";
import { ESTADOS_UI, ORDEN_CICLO, siguienteEstado } from "./estados-ui";
import { Boton } from "@/components/ui/boton";

type EstudianteItem = { id: string; nombre: string };
type EstadoGuardado =
  | "inactivo"
  | "guardando"
  | "guardado"
  | "offline"
  | "sincronizando"
  | "conflicto"
  | "error";
type Marcas = Record<string, EstadoAsistencia>;
type PayloadCola = {
  cursoId: string;
  bloqueHorarioId?: string;
  fecha: string;
  marcas: Array<{ estudianteId: string; estado: EstadoAsistencia }>;
  clientMutationId: string;
  capturadaEn: string;
  versionBase: string;
  versionDiariaBase?: string;
  expiraEn: number;
};

export function RegistroAsistencia({
  cursoId,
  bloqueHorarioId,
  esSegundaHora,
  fecha,
  hoy,
  estudiantes,
  iniciales,
  contextoCola,
  versionBase,
  versionDiariaBase,
  siguiente,
}: {
  cursoId: string;
  bloqueHorarioId?: string;
  /** La segunda hora pedagógica alimenta además el control diario oficial. */
  esSegundaHora?: boolean;
  fecha: string;
  hoy: string;
  estudiantes: EstudianteItem[];
  iniciales: Marcas;
  /** Particiona la cola por colegio y usuario sin almacenar nombres ni RUT. */
  contextoCola: string;
  versionBase: string;
  versionDiariaBase?: string;
  /** Siguiente clase del profesor hoy, para saltar sin volver al inicio. */
  siguiente?: { cursoId: string; nombre: string; bloqueId?: string } | null;
}) {
  const router = useRouter();
  const [marcas, setMarcas] = useState<Marcas>(() =>
    Object.fromEntries(estudiantes.map((e) => [e.id, iniciales[e.id] ?? "PRESENTE"]))
  );
  const [guardado, setGuardado] = useState<EstadoGuardado>("inactivo");
  const [enLinea, setEnLinea] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  // Estado activo del "pincel": al elegirlo, tocar o arrastrar sobre los
  // estudiantes les aplica ese estado en lote (marcado masivo).
  const [pincel, setPincel] = useState<EstadoAsistencia | null>(null);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marcasRef = useRef(marcas);
  const undoStack = useRef<Marcas[]>([]);
  const pintando = useRef(false);
  const versionRef = useRef(versionBase);
  const versionDiariaRef = useRef(versionDiariaBase);
  const claveCola = `aulia:asistencia:cola:${contextoCola}:${cursoId}:${bloqueHorarioId ?? "diaria"}:${fecha}`;
  const prefijoColas = `aulia:asistencia:cola:${contextoCola}:`;

  function enviar(payload: PayloadCola) {
    return payload.bloqueHorarioId
      ? guardarAsistenciaBloque(payload)
      : guardarAsistencia(payload);
  }

  // ── Cola offline PERSISTENTE ────────────────────────────────────────────────
  // localStorage (no sessionStorage): la lista marcada sin internet sobrevive a
  // cerrar la pestaña o el navegador, y se sincroniza sola al volver la señal.
  // La clave no contiene nombres ni RUT (solo ids), y cada lote expira a las 12 h.
  function leerCola(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null; // almacenamiento no disponible (modo privado estricto)
    }
  }
  function escribirCola(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sin almacenamiento: el estado "offline" igual avisa a la persona */
    }
  }
  function borrarCola(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* sin almacenamiento */
    }
  }

  /**
   * Sincroniza TODOS los lotes pendientes de esta persona (otras fechas, otros
   * cursos marcados sin conexión), no solo el de la página actual. Best-effort:
   * un lote con conflicto se conserva y se resuelve al abrir su propia página.
   */
  async function sincronizarColasPendientes() {
    if (!navigator.onLine) return;
    const claves: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefijoColas) && k !== claveCola) claves.push(k);
      }
    } catch {
      return;
    }
    for (const k of claves) {
      try {
        const crudo = leerCola(k);
        if (!crudo) continue;
        const p = JSON.parse(crudo) as PayloadCola;
        if (p.expiraEn < Date.now()) {
          borrarCola(k);
          continue;
        }
        const res = await enviar(p);
        if (res.ok) borrarCola(k);
        // Conflicto o error: el lote queda guardado para resolverlo en su página.
      } catch {
        // Red aún inestable: se reintentará en el próximo evento "online".
      }
    }
  }

  useEffect(() => {
    marcasRef.current = marcas;
  }, [marcas]);

  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);

  async function sincronizarCola() {
    if (!navigator.onLine) return;
    const guardada = leerCola(claveCola);
    if (!guardada) return;
    try {
      const payload = JSON.parse(guardada) as PayloadCola;
      if (payload.expiraEn < Date.now()) {
        borrarCola(claveCola);
        setGuardado("error");
        return;
      }
      setGuardado("sincronizando");
      const res = await enviar(payload);
      if (res.ok) {
        versionRef.current = res.version;
        if (res.versionDiaria) versionDiariaRef.current = res.versionDiaria;
        borrarCola(claveCola);
        setGuardado("guardado");
      } else if ("conflicto" in res && res.conflicto) {
        setGuardado("conflicto");
      } else {
        setGuardado("error");
      }
    } catch {
      setGuardado("error");
    }
  }

  useEffect(() => {
    const alVolver = () => {
      void sincronizarCola();
      void sincronizarColasPendientes();
    };
    window.addEventListener("online", alVolver);
    if (navigator.onLine) {
      void sincronizarCola();
      // Además envía lotes de OTRAS fechas/cursos marcados sin conexión
      // (p. ej. si la persona cerró el navegador antes de recuperar señal).
      void sincronizarColasPendientes();
    } else if (leerCola(claveCola)) setGuardado("offline");
    return () => window.removeEventListener("online", alVolver);
    // La clave identifica por completo el lote que puede recuperarse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveCola]);

  // Fin del arrastre en cualquier parte de la ventana.
  useEffect(() => {
    const fin = () => {
      pintando.current = false;
    };
    window.addEventListener("pointerup", fin);
    window.addEventListener("pointercancel", fin);
    return () => {
      window.removeEventListener("pointerup", fin);
      window.removeEventListener("pointercancel", fin);
    };
  }, []);

  const esFutura = fecha > hoy;

  async function persistir(estado: Marcas): Promise<boolean> {
    const payload: PayloadCola = {
      cursoId,
      bloqueHorarioId,
      fecha,
      marcas: estudiantes.map((e) => ({ estudianteId: e.id, estado: estado[e.id] })),
      clientMutationId: crypto.randomUUID(),
      capturadaEn: new Date().toISOString(),
      versionBase: versionRef.current,
      versionDiariaBase: versionDiariaRef.current,
      expiraEn: Date.now() + 12 * 60 * 60 * 1000,
    };

    if (!navigator.onLine) {
      escribirCola(claveCola, JSON.stringify(payload));
      setGuardado("offline");
      return true;
    }

    setGuardado("guardando");
    try {
      const res = await enviar(payload);
      if (res.ok) {
        versionRef.current = res.version;
        if (res.versionDiaria) versionDiariaRef.current = res.versionDiaria;
        borrarCola(claveCola);
        setGuardado("guardado");
        return true;
      } else if ("conflicto" in res && res.conflicto) {
        escribirCola(claveCola, JSON.stringify(payload));
        setGuardado("conflicto");
      } else {
        escribirCola(claveCola, JSON.stringify(payload));
        setGuardado("error");
      }
    } catch {
      escribirCola(claveCola, JSON.stringify(payload));
      setGuardado("offline");
      return true;
    }
    return false;
  }

  function programarGuardado(estado: Marcas) {
    if (esFutura) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persistir(estado), 600);
  }

  /** Guarda una foto del estado actual para poder deshacer. */
  function fotoUndo() {
    undoStack.current.push({ ...marcasRef.current });
    if (undoStack.current.length > 50) undoStack.current.shift();
    setPuedeDeshacer(true);
  }

  function aplicar(next: Marcas) {
    setMarcas(next);
    programarGuardado(next);
  }

  function setUno(id: string, estado: EstadoAsistencia) {
    aplicar({ ...marcasRef.current, [id]: estado });
  }

  function deshacer() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    if (!undoStack.current.length) setPuedeDeshacer(false);
    setMenuAbierto(null);
    aplicar(prev);
  }

  /** Acción de un estudiante: pinta si hay pincel, si no cicla el estado. */
  function accionEstudiante(id: string) {
    if (esFutura) return;
    fotoUndo();
    setUno(id, pincel ?? siguienteEstado(marcasRef.current[id]));
    setMenuAbierto(null);
  }

  // Puntero (mouse/táctil): en pincel pinta y arrastra; sin pincel, cicla el
  // estado. El teclado se maneja aparte en onClick (detail 0), para no duplicar.
  function onPointerDownFila(id: string) {
    if (esFutura) return;
    fotoUndo();
    if (pincel) {
      pintando.current = true;
      setUno(id, pincel);
    } else {
      setUno(id, siguienteEstado(marcasRef.current[id]));
    }
  }
  function onPointerEnterFila(id: string) {
    if (esFutura || !pincel || !pintando.current) return;
    setUno(id, pincel); // el mismo gesto: no apila otro undo
  }

  function elegirDesdeMenu(id: string, estado: EstadoAsistencia) {
    if (esFutura) return;
    fotoUndo();
    setUno(id, estado);
    setMenuAbierto(null);
  }

  function marcarTodos(estado: EstadoAsistencia) {
    if (esFutura) return;
    fotoUndo();
    aplicar(Object.fromEntries(estudiantes.map((e) => [e.id, estado])));
  }

  function guardarAhora() {
    if (esFutura) return;
    if (timer.current) clearTimeout(timer.current);
    void persistir(marcasRef.current);
  }

  async function guardarYSiguiente() {
    if (!siguiente || esFutura || guardado === "guardando" || guardado === "sincronizando") return;
    if (timer.current) clearTimeout(timer.current);
    const seguro = await persistir(marcasRef.current);
    if (seguro) {
      const bloque = siguiente.bloqueId ? `&bloqueId=${siguiente.bloqueId}` : "";
      router.push(`/libro-clases/asistencia?cursoId=${siguiente.cursoId}${bloque}&fecha=${fecha}`);
    }
  }

  function resolverConflicto() {
    // Para reemplazar una versión legal siempre se exige una nueva lectura. No
    // existe una vía cliente que quite versionBase y fuerce la sobrescritura.
    borrarCola(claveCola);
    window.location.reload();
  }

  const conteos = ESTADOS_ASISTENCIA.map((estado) => ({
    estado,
    n: estudiantes.filter((e) => marcas[e.id] === estado).length,
  }));
  // Resumen en vivo: % de presencia (presente = ≠ ausente, coherente con el
  // resto de la plataforma) y distribución visual que se actualiza al marcar.
  const marcados = conteos.reduce((s, c) => s + c.n, 0);
  const sinMarcar = estudiantes.length - marcados;
  const presentesHoy = conteos.filter((c) => c.estado !== "AUSENTE").reduce((s, c) => s + c.n, 0);
  const pctPresentes = marcados > 0 ? Math.round((presentesHoy / marcados) * 100) : null;

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-8">
      {/* Resumen sticky en vivo: conteos + % + barra de distribución */}
      <div className="sticky top-0 z-10 mt-4 rounded-xl border border-borde bg-superficie/95 px-4 py-3 text-sm shadow-suave backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {conteos.map(({ estado, n }) => (
            <span key={estado} className={`inline-flex items-center gap-1.5 font-semibold ${ESTADOS_UI[estado].texto}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${ESTADOS_UI[estado].celda}`} aria-hidden />
              {n} {ESTADOS_UI[estado].label.toLowerCase()}
            </span>
          ))}
          <span className="ml-auto flex items-baseline gap-2">
            {pctPresentes !== null && (
              <span
                className="font-display text-lg font-bold leading-none tabular-nums text-tinta"
                aria-label={`${pctPresentes}% de asistencia`}
              >
                {pctPresentes}%
              </span>
            )}
            <span className="text-xs text-tinta-tenue">{estudiantes.length} estudiantes</span>
          </span>
        </div>
        {/* Distribución apilada (los colores repiten los estados de arriba; el
            segmento gris son estudiantes aún sin marcar) */}
        <div
          className="mt-2.5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={`Distribución: ${conteos
            .filter((c) => c.n > 0)
            .map((c) => `${c.n} ${ESTADOS_UI[c.estado].label.toLowerCase()}`)
            .join(", ")}${sinMarcar > 0 ? `, ${sinMarcar} sin marcar` : ""}`}
        >
          {conteos
            .filter((c) => c.n > 0)
            .map((c) => (
              <span
                key={c.estado}
                className={`h-full rounded-full transition-all duration-300 ${ESTADOS_UI[c.estado].celda}`}
                style={{ width: `${(c.n / estudiantes.length) * 100}%` }}
              />
            ))}
          {sinMarcar > 0 && (
            <span
              className="h-full rounded-full bg-borde transition-all duration-300"
              style={{ width: `${(sinMarcar / estudiantes.length) * 100}%` }}
            />
          )}
        </div>
      </div>

      {esFutura && (
        <p className="mt-3 rounded-xl border border-alerta/20 bg-alerta-suave px-4 py-2 text-sm text-alerta">
          Esta fecha aún no ocurre: no se puede registrar asistencia de un día futuro.
        </p>
      )}

      {bloqueHorarioId && (
        <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
          esSegundaHora
            ? "border-alerta/25 bg-alerta-suave text-alerta"
            : "border-marca-200 bg-marca-50 text-marca-700"
        }`} role="status">
          <p className="font-semibold">
            {esSegundaHora ? "Asistencia por bloque · segunda hora" : "Asistencia por bloque"}
          </p>
          <p className="mt-0.5 text-xs opacity-80">
            {esSegundaHora
              ? "Este bloque conserva su detalle y también concilia el control diario usado para el resumen mensual."
              : "Este registro corresponde solo a esta clase y no reemplaza el control diario de segunda hora."}
          </p>
        </div>
      )}

      {!enLinea && !esFutura && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-alerta/25 bg-alerta-suave px-4 py-3 text-sm text-alerta" role="status">
          <span aria-hidden>↻</span>
          <div>
            <p className="font-semibold">Sin conexión</p>
            <p className="mt-0.5 text-xs opacity-80">
              Puedes continuar e incluso cerrar el navegador: la lista queda guardada en este
              dispositivo y se enviará sola cuando vuelva internet.
            </p>
          </div>
        </div>
      )}

      {/* Marcado masivo: elige un estado (pincel) y toca o arrastra sobre la lista */}
      {!esFutura && (
        <div className="mt-3 rounded-xl border border-borde bg-superficie p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
              Marcar varios
            </span>
            {ORDEN_CICLO.map((k) => {
              const s = ESTADOS_UI[k];
              const activo = pincel === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPincel(activo ? null : k)}
                  aria-pressed={activo}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    activo ? `${s.fila} ring-2 ring-marca-500/40` : "border-borde text-tinta-suave hover:bg-superficie-2"
                  }`}
                >
                  <span aria-hidden>{s.icono}</span>
                  {s.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => marcarTodos("PRESENTE")}
              className="ml-auto rounded-lg border border-borde px-2.5 py-1.5 text-xs font-semibold text-tinta-suave hover:bg-superficie-2"
            >
              Todos presentes
            </button>
          </div>
          {pincel && (
            <p className="mt-2 flex items-center gap-2 rounded-lg bg-marca-50 px-2.5 py-1.5 text-xs text-marca-700">
              <span>
                Modo marcar <strong>{ESTADOS_UI[pincel].label.toLowerCase()}</strong>: toca o arrastra sobre los estudiantes.
              </span>
              <button type="button" onClick={() => setPincel(null)} className="ml-auto font-semibold underline">
                Listo
              </button>
            </p>
          )}
        </div>
      )}

      <ul className={`mt-3 space-y-1.5 ${pincel ? "touch-none select-none" : ""}`}>
        {estudiantes.map((e) => {
          const estado = marcas[e.id];
          const ui = ESTADOS_UI[estado];
          return (
            <li key={e.id}>
              <div className={`flex items-center gap-3 rounded-xl border p-2 pl-3 transition-colors ${ui.fila}`}>
                <button
                  type="button"
                  disabled={esFutura}
                  onPointerDown={() => onPointerDownFila(e.id)}
                  onPointerEnter={() => onPointerEnterFila(e.id)}
                  // Solo actúa por teclado (Enter/Espacio → detail 0); el puntero
                  // ya se maneja en onPointerDown para soportar el arrastre.
                  onClick={(ev) => {
                    if (ev.detail === 0) accionEstudiante(e.id);
                  }}
                  aria-label={`${e.nombre}: ${ui.label}. ${pincel ? `Aplicar ${ESTADOS_UI[pincel].label}` : "Tocar para cambiar estado"}.`}
                  className="flex min-h-[52px] flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-marca-500/40 disabled:opacity-60"
                >
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold ${ui.celda}`} aria-hidden>
                    {ui.icono}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-tinta">{e.nombre}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{ui.label}</span>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={esFutura}
                  onClick={() => setMenuAbierto((abierto) => (abierto === e.id ? null : e.id))}
                  aria-label={`Elegir estado de ${e.nombre}`}
                  aria-expanded={menuAbierto === e.id}
                  className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-tinta-tenue outline-none hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-marca-500/40 disabled:opacity-60"
                >
                  ···
                </button>
              </div>

              {menuAbierto === e.id && (
                <div className="mt-1 grid grid-cols-4 gap-2 rounded-xl border border-borde bg-superficie p-2 shadow-suave">
                  {ORDEN_CICLO.map((k) => {
                    const s = ESTADOS_UI[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => elegirDesdeMenu(e.id, k)}
                        aria-pressed={estado === k}
                        className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold ${s.fila} ${
                          estado === k ? "ring-2 ring-marca-500/30" : ""
                        }`}
                      >
                        <span className="text-lg" aria-hidden>{s.icono}</span>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Barra de guardado (fija en móvil) */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 px-4 py-3 backdrop-blur md:static md:mt-6 md:rounded-2xl md:border"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm">
            {guardado === "guardando" && (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-alerta" aria-hidden />
                <span className="text-tinta-tenue">Guardando…</span>
              </>
            )}
            {guardado === "guardado" && (
              <>
                <span className="text-exito" aria-hidden>✓</span>
                <span className="text-tinta-tenue">Guardado</span>
              </>
            )}
            {guardado === "offline" && (
              <>
                <span className="h-2 w-2 rounded-full bg-alerta" aria-hidden />
                <span className="font-medium text-alerta">Guardado en este dispositivo</span>
              </>
            )}
            {guardado === "sincronizando" && (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-marca-500" aria-hidden />
                <span className="text-tinta-tenue">Sincronizando cambios…</span>
              </>
            )}
            {guardado === "conflicto" && (
              <span className="font-semibold text-alerta">Hay cambios más recientes</span>
            )}
            {guardado === "error" && <span className="font-medium text-peligro">No se pudo guardar — reintenta</span>}
          </span>

          <div className="flex items-center gap-2">
            {puedeDeshacer && !esFutura && (
              <button
                type="button"
                onClick={deshacer}
                className="inline-flex items-center gap-1.5 rounded-xl border border-borde px-3 py-2 text-sm font-semibold text-tinta-suave hover:bg-superficie-2"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M8 5L4 9l4 4" />
                  <path d="M4 9h9a4 4 0 010 8h-1" />
                </svg>
                Deshacer
              </button>
            )}
            {siguiente ? (
              <button
                type="button"
                onClick={() => void guardarYSiguiente()}
                disabled={guardado === "guardando" || guardado === "sincronizando" || guardado === "conflicto"}
                className="inline-flex items-center gap-1.5 rounded-xl bg-marca-600 px-4 py-2 text-sm font-semibold text-white hover:bg-marca-700"
              >
                Siguiente: {siguiente.nombre}
                <span aria-hidden>→</span>
              </button>
            ) : (
              <Boton type="button" onClick={guardarAhora} disabled={esFutura || guardado === "guardando"}>
                {bloqueHorarioId ? "Guardar clase" : "Guardar asistencia diaria"}
              </Boton>
            )}
          </div>
        </div>
        {guardado === "conflicto" && (
          <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center gap-2 rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
            <p className="mr-auto">Elige conscientemente qué versión conservar; no reintentaremos en forma automática.</p>
            <button type="button" onClick={resolverConflicto} className="min-h-10 rounded-lg bg-alerta px-3 font-semibold text-white">Recargar y revisar</button>
          </div>
        )}
      </div>

      {/* Selector de fecha: navega recargando el Server Component con la fecha elegida */}
      <div className="mt-4 flex items-center gap-2 text-sm text-tinta-tenue">
        <label className="inline-flex items-center gap-2">
          <span aria-hidden>📅</span>
          <span className="sr-only">Cambiar fecha</span>
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(ev) => router.push(`/libro-clases/asistencia?cursoId=${cursoId}&fecha=${ev.target.value}`)}
            className="rounded-xl border border-borde bg-superficie px-3 py-2 font-medium shadow-suave outline-none focus-visible:ring-2 focus-visible:ring-marca-500/40"
          />
        </label>
      </div>
    </div>
  );
}
