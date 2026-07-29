"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { guardarClase, firmarClase, rectificarClase } from "./actions";
import { Iconos } from "@/components/ui/iconos";
import { Boton } from "@/components/ui/boton";
import { colorAsignatura } from "@/lib/colores-asignatura";
import {
  bloquesParaFecha,
  type BloqueLeccionario as Bloque,
} from "./bloques-fecha";

type PlanClase = {
  id: string;
  titulo: string;
  contenido: string;
  unidad: string | null;
  numeroClase: number;
  version: number;
  fechaInicio: string | null;
  oaCodigos: string[];
};
type Clase = {
  id: string;
  fecha: string;
  contenido: string;
  oaIds: string[];
  bloqueHorarioId: string | null;
  firmadaEn: string | null;
  firmadaPorId: string | null;
  firmadaPorNombre: string | null;
  planificacionOrigenId: string | null;
  planificacionOrigenVersion: number | null;
  planificacionOrigenTitulo: string | null;
  planificacionOrigenUnidad: string | null;
};

const DIAS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const etiquetaBloque = (b: Bloque) =>
  `${DIAS[b.dia] ?? "?"} ${b.horaInicio}–${b.horaFin}${
    b.versionNumero ? ` · horario v${b.versionNumero}` : ""
  }`;

function fmtFecha(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T00:00:00Z`));
}

// Mes de una clase (para agrupar la lista y evitar el listado plano confuso).
const mesClave = (iso: string) => iso.slice(0, 7);
function mesLargo(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function fmtFirma(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function parseOa(texto: string): string[] {
  return texto
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

const ROLES_ELEVADOS = new Set(["UTP", "DIRECTOR", "ADMIN"]);

export function RegistroClases({
  asignaturaId,
  asignaturaNombre,
  asignaturaColor,
  puedeGestionar,
  rol,
  usuarioId,
  usuarioNombre,
  hoy,
  bloques,
  clases,
  planesClase = [],
  bloqueInicialId,
  planificacionInicialId,
}: {
  asignaturaId: string;
  asignaturaNombre: string;
  asignaturaColor: string | null;
  puedeGestionar: boolean;
  rol: string;
  usuarioId: string;
  usuarioNombre: string;
  hoy: string;
  bloques: Bloque[];
  clases: Clase[];
  planesClase?: PlanClase[];
  bloqueInicialId: string | null;
  planificacionInicialId: string | null;
}) {
  const router = useRouter();
  const planInicial = planesClase.find((plan) => plan.id === planificacionInicialId);
  const bloqueHoy = bloquesParaFecha(bloques, hoy)[0]?.id ?? "";
  const [fecha, setFecha] = useState(hoy);
  const [bloqueId, setBloqueId] = useState(bloqueInicialId ?? bloqueHoy);
  const [contenido, setContenido] = useState(planInicial?.contenido ?? "");
  // OA heredados de la planificación al copiar una clase: se guardan en la clase
  // (invisibles para el docente) para que la cobertura curricular "tratada" se
  // calcule desde el plan, sin pedirle escribir OA a mano.
  const [oaHeredados, setOaHeredados] = useState<string[]>(planInicial?.oaCodigos ?? []);
  const [planSeleccionadoId, setPlanSeleccionadoId] = useState(planInicial?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rectificando, setRectificando] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  // Notificación breve de éxito (la profesora pidió una confirmación clara al
  // firmar; antes había que revisar la lista para saber si guardó).
  function confirmar(texto: string) {
    setConfirmacion(texto);
    setTimeout(() => setConfirmacion(null), 3500);
  }

  const puedeRectificar = (c: Clase) =>
    ROLES_ELEVADOS.has(rol) || c.firmadaPorId === usuarioId;

  async function registrar(firmar: boolean) {
    if (contenido.trim().length < 3) {
      setMsg("Describe los contenidos tratados.");
      return;
    }
    if (!bloqueId) {
      setMsg("Selecciona el bloque horario publicado de esta clase.");
      return;
    }
    setOcupado(true);
    setMsg(null);
    const res = await guardarClase({
      asignaturaId,
      bloqueHorarioId: bloqueId,
      fecha,
      contenido,
      oaIds: oaHeredados,
      planificacionOrigenId: planSeleccionadoId || undefined,
    });
    if (!res.ok) {
      setOcupado(false);
      setMsg(res.error);
      return;
    }
    if (firmar) {
      const f = await firmarClase(asignaturaId, res.id);
      if (!f.ok) {
        setOcupado(false);
        setMsg(f.error);
        router.refresh();
        return;
      }
    }
    setContenido("");
    setBloqueId("");
    setOaHeredados([]);
    setPlanSeleccionadoId("");
    setOcupado(false);
    confirmar(firmar ? "✓ Clase firmada" : "Clase guardada (sin firmar)");
    router.refresh();
  }

  async function firmarExistente(id: string) {
    setOcupado(true);
    const res = await firmarClase(asignaturaId, id);
    setOcupado(false);
    if (res.ok) {
      confirmar("✓ Clase firmada");
      router.refresh();
    } else toast.error(res.error);
  }

  function editar(c: Clase) {
    setFecha(c.fecha);
    setBloqueId(c.bloqueHorarioId ?? "");
    setContenido(c.contenido);
    setOaHeredados(c.oaIds);
    setPlanSeleccionadoId("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Copia el contenido de una clase planificada al leccionario (pedido de la
  // profesora: no reescribir lo que ya está en la planificación).
  function copiarDesdePlan(id: string) {
    const p = planesClase.find((x) => x.id === id);
    if (!p) return;
    setContenido(p.contenido);
    setOaHeredados(p.oaCodigos);
    setPlanSeleccionadoId(p.id);
    setMsg(null);
    confirmar("Copiado desde la planificación");
  }

  const planSeleccionado = planesClase.find((plan) => plan.id === planSeleccionadoId);
  const color = colorAsignatura(asignaturaNombre, asignaturaColor);
  const bloquesFecha = bloquesParaFecha(bloques, fecha);

  return (
    <div className="mt-6">
      {puedeGestionar && (
        <div id="registrar-clase" className="grid scroll-mt-24 gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="superficie overflow-hidden rounded-xl">
            <div className="flex">
              <span className={`w-1.5 shrink-0 ${color.punto}`} aria-hidden />
              <div className="min-w-0 flex-1 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-tinta">Registrar clase</h2>
                    <p className="mt-0.5 text-xs text-tinta-tenue">
                      Registra lo que efectivamente se realizó, aunque hayas partido desde una planificación.
                    </p>
                  </div>
                  <span className={`insignia ${color.suave}`}>{asignaturaNombre}</span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-tinta-suave">
                    Fecha de la clase
                    <input
                      type="date"
                      value={fecha}
                      max={hoy}
                      onChange={(evento) => {
                        const nuevaFecha = evento.target.value;
                        setFecha(nuevaFecha);
                        setBloqueId(bloquesParaFecha(bloques, nuevaFecha)[0]?.id ?? "");
                      }}
                      className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta"
                    />
                  </label>
                  {bloquesFecha.length > 0 ? (
                    <label className="text-xs font-medium text-tinta-suave">
                      Bloque horario
                      <select
                        value={bloqueId}
                        onChange={(evento) => setBloqueId(evento.target.value)}
                        className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta"
                      >
                        <option value="">Selecciona un bloque…</option>
                        {bloquesFecha.map((bloque) => (
                          <option key={bloque.id} value={bloque.id}>{etiquetaBloque(bloque)}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="rounded-lg bg-alerta-suave px-3 py-2 text-xs font-medium text-alerta">
                      No hay bloques publicados vigentes para esta fecha.
                    </p>
                  )}
                </div>

                <label className="mt-4 block text-xs font-medium text-tinta-suave">
                  Contenidos efectivamente tratados
                  <textarea
                    value={contenido}
                    onChange={(evento) => setContenido(evento.target.value)}
                    rows={5}
                    placeholder="Describe los contenidos y actividades realizadas…"
                    className="mt-1 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-sm text-tinta outline-none focus:ring-2 focus:ring-marca-500/40"
                  />
                </label>

                {oaHeredados.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-tinta-tenue">
                    <span>OA copiados:</span>
                    {oaHeredados.map((oa) => (
                      <span key={oa} className="rounded-md bg-superficie-3 px-1.5 py-0.5 font-medium text-tinta-suave">{oa}</span>
                    ))}
                  </div>
                )}

                {msg && <p className="mt-2 text-sm text-peligro" role="alert">{msg}</p>}

                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
                  <Boton
                    type="button"
                    variante="secundario"
                    onClick={() => void registrar(false)}
                    disabled={ocupado || !bloqueId}
                  >
                    {ocupado ? "Guardando…" : "Guardar sin firmar"}
                  </Boton>
                  <Boton
                    type="button"
                    onClick={() => void registrar(true)}
                    disabled={ocupado || !bloqueId}
                  >
                    ✍️ Guardar y firmar
                  </Boton>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-tinta-tenue">
                  Al firmar, <strong className="text-tinta-suave">{usuarioNombre}</strong> consolida el contenido efectivo con fecha y hora de Chile. Después solo puede corregirse mediante una rectificación registrada.
                </p>
              </div>
            </div>
          </div>

          <aside className="superficie h-fit rounded-xl p-4 lg:sticky lg:top-20" aria-labelledby="desde-planificacion-titulo">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700">
                <Iconos.planificacion className="h-5 w-5" />
              </span>
              <div>
                <h3 id="desde-planificacion-titulo" className="text-sm font-semibold text-tinta">Desde planificación</h3>
                <p className="text-xs text-tinta-tenue">Copia una clase y revísala</p>
              </div>
            </div>

            {planesClase.length > 0 ? (
              <>
                <label className="mt-4 block text-xs font-medium text-tinta-suave" htmlFor="clase-planificada">
                  Unidad y clase
                </label>
                <select
                  id="clase-planificada"
                  value={planSeleccionadoId}
                  onChange={(evento) => copiarDesdePlan(evento.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-superficie px-2.5 text-sm font-medium text-tinta"
                >
                  <option value="">Selecciona una clase…</option>
                  {planesClase.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.unidad ? `${plan.unidad} · ` : ""}Clase {plan.numeroClase} — {plan.titulo}
                    </option>
                  ))}
                </select>

                {planSeleccionado && (
                  <div className="mt-3 rounded-xl border border-marca-200 bg-marca-50 p-3 text-xs text-marca-800">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="insignia insignia-marca">Clase {planSeleccionado.numeroClase}</span>
                      <span className="font-medium">versión {planSeleccionado.version}</span>
                    </div>
                    <p className="mt-2 font-semibold">{planSeleccionado.unidad ?? "Sin unidad"}</p>
                    <p className="mt-0.5 text-marca-700">{planSeleccionado.titulo}</p>
                    {planSeleccionado.fechaInicio && (
                      <p className="mt-1 text-marca-700">Planificada para {fmtFecha(planSeleccionado.fechaInicio)}</p>
                    )}
                    <p className="mt-2 border-t border-marca-200 pt-2 leading-relaxed">
                      Se copió como borrador. Puedes editarlo para reflejar lo que realmente ocurrió.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-4 rounded-lg bg-superficie-2 p-3 text-xs leading-relaxed text-tinta-suave">
                Aún no hay clases planificadas para esta asignatura.
              </p>
            )}

            <Link href={`/planificacion?asignaturaId=${asignaturaId}`} className="mt-4 inline-flex min-h-11 items-center text-xs font-semibold text-marca-600 hover:text-marca-700">
              ✨ Abrir planificación y asistente IA →
            </Link>
          </aside>
        </div>
      )}

      <div className="mt-6 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-tinta">Clases del leccionario</h2>
        {clases.length > 0 && (
          <span className="text-xs text-tinta-tenue">
            {clases.filter((c) => c.firmadaEn).length} de {clases.length} firmadas
          </span>
        )}
      </div>
      {clases.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center text-sm text-tinta-tenue">
          Aún no hay clases registradas para esta asignatura.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {clases.map((c, i) => {
            const bloque = bloques.find((b) => b.id === c.bloqueHorarioId);
            const firmada = !!c.firmadaEn;
            const nuevoMes = i === 0 || mesClave(clases[i - 1].fecha) !== mesClave(c.fecha);
            return (
              <div key={`grupo-${c.id}`}>
              {nuevoMes && (
                <p className="mb-2 mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide capitalize text-tinta-tenue first:mt-0">
                  {mesLargo(c.fecha)}
                </p>
              )}
              <li
                key={c.id}
                className={`rounded-xl border p-4 shadow-suave ${
                  firmada ? "border-exito/20 bg-exito-suave/40" : "border-borde bg-superficie"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold capitalize text-tinta">
                    {fmtFecha(c.fecha)}
                    {bloque && (
                      <span className="ml-2 text-xs font-normal text-tinta-tenue">
                        {etiquetaBloque(bloque)}
                      </span>
                    )}
                  </span>
                  {firmada ? (
                    <span className="text-right text-xs text-exito">
                      <span className="block rounded-lg bg-exito-suave px-2 py-0.5 font-semibold">
                        ✍️ Firma registrada · {c.firmadaPorNombre}
                      </span>
                      <span className="mt-1 block text-[11px] text-tinta-tenue">
                        {fmtFirma(c.firmadaEn!)} (hora de Chile)
                      </span>
                    </span>
                  ) : (
                    <span className="rounded-lg bg-alerta-suave px-2 py-0.5 text-xs font-semibold text-alerta">
                      Sin firmar
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-tinta">
                  {c.contenido}
                </p>
                {c.planificacionOrigenId && (
                  <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-marca-50 px-2 py-1 text-xs text-marca-700">
                    <Iconos.planificacion className="h-3.5 w-3.5" />
                    <span className="font-semibold">Copiada desde planificación</span>
                    <span>
                      {c.planificacionOrigenUnidad
                        ? `${c.planificacionOrigenUnidad} · `
                        : ""}
                      {c.planificacionOrigenTitulo ?? "Clase planificada"}
                      {c.planificacionOrigenVersion
                        ? ` · versión ${c.planificacionOrigenVersion}`
                        : ""}
                    </span>
                  </p>
                )}
                {c.oaIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.oaIds.map((oaId) => (
                      <span
                        key={oaId}
                        className="rounded-md bg-superficie-3 px-1.5 py-0.5 text-xs font-medium text-tinta-tenue"
                      >
                        {oaId}
                      </span>
                    ))}
                  </div>
                )}

                {puedeGestionar && (
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
                    {!firmada && (
                      <>
                        <button
                          type="button"
                          onClick={() => editar(c)}
                          className="text-tinta-tenue hover:text-tinta"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void firmarExistente(c.id)}
                          disabled={ocupado}
                          className="text-exito hover:underline disabled:opacity-50"
                        >
                          ✍️ Firmar
                        </button>
                      </>
                    )}
                    {firmada && puedeRectificar(c) && (
                      <button
                        type="button"
                        onClick={() =>
                          setRectificando((r) => (r === c.id ? null : c.id))
                        }
                        className="text-tinta-tenue hover:text-tinta"
                      >
                        Rectificar
                      </button>
                    )}
                  </div>
                )}

                {rectificando === c.id && (
                  <RectificarForm
                    asignaturaId={asignaturaId}
                    clase={c}
                    onDone={() => {
                      setRectificando(null);
                      router.refresh();
                    }}
                  />
                )}
              </li>
              </div>
            );
          })}
        </ul>
      )}

      {/* Confirmación clara al firmar/guardar (pedido de la profesora) */}
      {confirmacion && (
        <div
          className="animar-surgir fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-full bg-exito px-5 py-2.5 text-sm font-semibold text-white shadow-flotante">
            {confirmacion}
          </div>
        </div>
      )}
    </div>
  );
}

function RectificarForm({
  asignaturaId,
  clase,
  onDone,
}: {
  asignaturaId: string;
  clase: Clase;
  onDone: () => void;
}) {
  const [contenido, setContenido] = useState(clase.contenido);
  const [oa, setOa] = useState(clase.oaIds.join(", "));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar() {
    setOcupado(true);
    setError(null);
    const res = await rectificarClase({
      claseId: clase.id,
      asignaturaId,
      fecha: clase.fecha,
      bloqueHorarioId: clase.bloqueHorarioId,
      contenido,
      oaIds: parseOa(oa),
      motivo,
    });
    setOcupado(false);
    if (res.ok) onDone();
    else setError(res.error);
  }

  return (
    <div className="mt-3 rounded-xl border border-borde bg-superficie p-3">
      <p className="text-xs font-semibold text-tinta-suave">
        Rectificar clase firmada (queda registrado en auditoría)
      </p>
      <textarea
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
        rows={2}
        className="mt-2 w-full rounded-lg border border-borde px-2 py-1.5 text-sm"
      />
      <input
        value={oa}
        onChange={(e) => setOa(e.target.value)}
        placeholder="OA separados por coma"
        className="mt-2 w-full rounded-lg border border-borde px-2 py-1.5 text-sm"
      />
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo de la rectificación (obligatorio)"
        className="mt-2 w-full rounded-lg border border-borde px-2 py-1.5 text-sm"
      />
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={ocupado || motivo.trim().length < 5}
          className="btn btn-primario btn-sm"
        >
          Guardar rectificación
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-tinta-tenue hover:text-tinta"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
