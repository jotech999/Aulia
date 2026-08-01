"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { confirmar } from "@/components/ui/confirmar";
import { Boton } from "@/components/ui/boton";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Iconos } from "@/components/ui/iconos";
import { useRouter } from "next/navigation";
import type { TipoPlanificacion, EstadoClasePlan } from "@/lib/planificacion";
import { colorAsignatura } from "@/lib/colores-asignatura";
import {
  crearPlanificacion,
  editarPlanificacion,
  eliminarPlanificacion,
  generarClasesUnidad,
  generarCronogramaUnidad,
  guardarComoPlantilla,
  proponerUnidadMes,
} from "./actions";

type OaOpcion = { codigo: string; eje: string; numero: number; descripcion: string };
type Plan = {
  id: string;
  tipo: TipoPlanificacion;
  titulo: string;
  descripcion: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  fechaClase: string | null;
  estadoClase: EstadoClasePlan | null;
  ordenClase: number | null;
  padreId: string | null;
  oaCodigos: string[];
  esPlantilla: boolean;
  version: number;
};

const ESTADO_CLASE_UI: Record<EstadoClasePlan, { label: string; clase: string }> = {
  PLANIFICADA: { label: "Planificada", clase: "bg-superficie-3 text-tinta-suave" },
  REALIZADA: { label: "Realizada", clase: "bg-exito-suave text-exito" },
  REPROGRAMADA: { label: "Reprogramada", clase: "bg-alerta-suave text-alerta" },
  SUSPENDIDA: { label: "Suspendida", clase: "bg-peligro/10 text-peligro" },
};

const TIPO_UI: Record<TipoPlanificacion, { label: string; badge: string }> = {
  ANUAL: { label: "Anual", badge: "bg-marca-50 text-marca-700 border-marca-200" },
  UNIDAD: { label: "Unidad", badge: "bg-alerta-suave text-alerta border-alerta/20" },
  CLASE: { label: "Clase", badge: "bg-superficie-3 text-tinta-suave border-borde" },
};

const ORDEN: TipoPlanificacion[] = ["ANUAL", "UNIDAD", "CLASE"];

const MESES = [
  { numero: 3, nombre: "Marzo", corto: "Mar" },
  { numero: 4, nombre: "Abril", corto: "Abr" },
  { numero: 5, nombre: "Mayo", corto: "May" },
  { numero: 6, nombre: "Junio", corto: "Jun" },
  { numero: 7, nombre: "Julio", corto: "Jul" },
  { numero: 8, nombre: "Agosto", corto: "Ago" },
  { numero: 9, nombre: "Septiembre", corto: "Sep" },
  { numero: 10, nombre: "Octubre", corto: "Oct" },
  { numero: 11, nombre: "Noviembre", corto: "Nov" },
  { numero: 12, nombre: "Diciembre", corto: "Dic" },
] as const;

function rangoMes(anio: number, mes: number) {
  const mm = String(mes).padStart(2, "0");
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    inicio: `${anio}-${mm}-01`,
    fin: `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

function planPerteneceAlMes(plan: Plan, anio: number, mes: number) {
  const { inicio, fin } = rangoMes(anio, mes);
  const planInicio = plan.fechaInicio ?? plan.fechaFin;
  const planFin = plan.fechaFin ?? plan.fechaInicio;
  return Boolean(planInicio && planFin && planInicio <= fin && planFin >= inicio);
}

function formatearRango(plan: Plan) {
  if (!plan.fechaInicio && !plan.fechaFin) return "Fechas por definir";
  const formato = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
  const fecha = (iso: string) => formato.format(new Date(`${iso}T00:00:00Z`));
  if (!plan.fechaInicio) return `Hasta ${fecha(plan.fechaFin!)}`;
  if (!plan.fechaFin || plan.fechaInicio === plan.fechaFin) return fecha(plan.fechaInicio);
  return `${fecha(plan.fechaInicio)} – ${fecha(plan.fechaFin)}`;
}

type Borrador = {
  id: string | null;
  versionOrigen: number | null;
  guardadoEn?: number;
  tipo: TipoPlanificacion;
  titulo: string;
  descripcion: string;
  fechaInicio: string;
  fechaFin: string;
  fechaClase: string;
  estadoClase: EstadoClasePlan;
  padreId: string;
  oaCodigos: string[];
};

const VIGENCIA_BORRADOR_MS = 7 * 24 * 60 * 60 * 1000;

const vacio = (): Borrador => ({
  id: null,
  versionOrigen: null,
  tipo: "UNIDAD",
  titulo: "",
  descripcion: "",
  fechaInicio: "",
  fechaFin: "",
  fechaClase: "",
  estadoClase: "PLANIFICADA",
  padreId: "",
  oaCodigos: [],
});

export function Planificador({
  asignaturaId,
  asignaturaNombre,
  asignaturaColor,
  anioEscolar,
  clasesPorMes,
  tieneHorarioPublicado,
  feriadosVerificados,
  puedeEditar,
  iaActiva = false,
  oaDisponibles,
  planificaciones,
}: {
  asignaturaId: string;
  asignaturaNombre: string;
  asignaturaColor: string | null;
  anioEscolar: number;
  clasesPorMes: Record<number, number>;
  tieneHorarioPublicado: boolean;
  feriadosVerificados: boolean;
  puedeEditar: boolean;
  iaActiva?: boolean;
  oaDisponibles: OaOpcion[];
  planificaciones: Plan[];
}) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [oaAbierto, setOaAbierto] = useState(false);
  const [generandoIA, setGenerandoIA] = useState<string | null>(null);
  const [numIA, setNumIA] = useState<Record<string, number>>({});
  const [generandoCron, setGenerandoCron] = useState<string | null>(null);
  const [numCron, setNumCron] = useState<Record<string, number>>({});
  const [panelUnidadIA, setPanelUnidadIA] = useState(false);
  const [indicacionesIA, setIndicacionesIA] = useState("");
  const [proponiendoUnidad, setProponiendoUnidad] = useState(false);
  const mesSantiago = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago",
      month: "numeric",
    }).format(new Date())
  );
  const [mesActivo, setMesActivo] = useState(
    mesSantiago >= 3 && mesSantiago <= 12 ? mesSantiago : 3
  );
  const [estadoLocal, setEstadoLocal] = useState<"inactivo" | "guardado" | "recuperado">("inactivo");
  const claveBorrador = `aulia:planificacion:borrador:${asignaturaId}`;

  useEffect(() => {
    const guardado = localStorage.getItem(claveBorrador);
    if (!guardado) return;
    try {
      const recuperado = JSON.parse(guardado) as Borrador;
      if (
        !recuperado.guardadoEn ||
        Date.now() - recuperado.guardadoEn > VIGENCIA_BORRADOR_MS
      ) {
        localStorage.removeItem(claveBorrador);
        setError("El borrador local venció. Crea uno nuevo para trabajar sobre datos actuales.");
        return;
      }
      if (recuperado.id) {
        const versionServidor = planificaciones.find(
          (plan) => plan.id === recuperado.id
        )?.version;
        if (
          !recuperado.versionOrigen ||
          !versionServidor ||
          recuperado.versionOrigen !== versionServidor
        ) {
          localStorage.removeItem(claveBorrador);
          setError(
            "No recuperamos el borrador porque existe una versión más reciente en el servidor."
          );
          return;
        }
      }
      setBorrador(recuperado);
      setEstadoLocal("recuperado");
    } catch { localStorage.removeItem(claveBorrador); }
  }, [claveBorrador, planificaciones]);

  useEffect(() => {
    if (!borrador) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        claveBorrador,
        JSON.stringify({ ...borrador, guardadoEn: Date.now() })
      );
      setEstadoLocal("guardado");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [borrador, claveBorrador]);

  // Propone con IA la unidad completa del mes y llena el formulario para
  // que la persona docente revise, ajuste y guarde (nada se guarda solo).
  async function proponerUnidadIA() {
    setError(null);
    setProponiendoUnidad(true);
    try {
      const rango = rangoMes(anioEscolar, mesActivo);
      const r = await proponerUnidadMes({
        asignaturaId,
        mesNombre: mesSeleccionado.nombre,
        clasesDelMes: clasesPorMes[mesActivo] ?? 0,
        indicaciones: indicacionesIA,
      });
      if (r.ok) {
        setBorrador({
          ...vacio(),
          titulo: r.titulo,
          descripcion: r.descripcion,
          oaCodigos: r.oaCodigos,
          fechaInicio: rango.inicio,
          fechaFin: rango.fin,
        });
        setPanelUnidadIA(false);
        setIndicacionesIA("");
        toast.exito("Propuesta lista. Revisa, ajusta y guarda.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else setError(r.error);
    } finally {
      setProponiendoUnidad(false);
    }
  }

  // Genera con IA una secuencia de clases para la unidad y las inserta.
  async function generarClasesIA(unidadId: string, numeroClases: number) {
    setError(null);
    setGenerandoIA(unidadId);
    try {
      const r = await generarClasesUnidad({ unidadId, numeroClases });
      if (r.ok) router.refresh();
      else setError(r.error);
    } finally {
      setGenerandoIA(null);
    }
  }

  // Auto-genera el cronograma SIN IA: reparte N clases en las fechas hábiles del
  // horario del curso (salta fines de semana, feriados y suspensiones).
  async function generarCronograma(unidadId: string, cantidad: number) {
    setError(null);
    setGenerandoCron(unidadId);
    try {
      const r = await generarCronogramaUnidad({ unidadId, cantidad });
      if (r.ok) {
        toast.exito(`${r.cantidad} ${r.cantidad === 1 ? "clase agendada" : "clases agendadas"} según el horario.`);
        router.refresh();
      } else setError(r.error);
    } finally {
      setGenerandoCron(null);
    }
  }

  const posiblesPadres = useMemo(
    () => planificaciones.filter((p) => !p.esPlantilla && p.tipo !== "CLASE"),
    [planificaciones]
  );

  function abrirNueva() {
    setError(null);
    setBorrador(vacio());
  }

  function abrirNuevaEnMes() {
    const rango = rangoMes(anioEscolar, mesActivo);
    setError(null);
    setBorrador({
      ...vacio(),
      fechaInicio: rango.inicio,
      fechaFin: rango.fin,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Abre el formulario para una CLASE nueva ya colgada de una unidad concreta,
  // para que planificar clase por clase sea directo (pedido de la profesora).
  function abrirClaseDe(unidadId: string) {
    setError(null);
    setBorrador({ ...vacio(), tipo: "CLASE", padreId: unidadId });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEdicion(p: Plan) {
    setError(null);
    setBorrador({
      id: p.id,
      versionOrigen: p.version,
      tipo: p.tipo,
      titulo: p.titulo,
      descripcion: p.descripcion ?? "",
      fechaInicio: p.fechaInicio ?? "",
      fechaFin: p.fechaFin ?? "",
      fechaClase: p.fechaClase ?? "",
      estadoClase: p.estadoClase ?? "PLANIFICADA",
      padreId: p.padreId ?? "",
      oaCodigos: p.oaCodigos,
    });
  }

  async function guardar() {
    if (!borrador) return;
    setOcupado(true);
    setError(null);
    const payload = {
      asignaturaId,
      tipo: borrador.tipo,
      titulo: borrador.titulo,
      descripcion: borrador.descripcion || undefined,
      fechaInicio: borrador.fechaInicio || null,
      fechaFin: borrador.fechaFin || null,
      fechaClase: borrador.tipo === "CLASE" ? borrador.fechaClase || null : null,
      estadoClase: borrador.tipo === "CLASE" ? borrador.estadoClase : null,
      padreId: borrador.padreId || null,
      oaCodigos: borrador.oaCodigos,
    };
    const res = borrador.id
      ? await editarPlanificacion(
          payload,
          borrador.id,
          borrador.versionOrigen ?? undefined
        )
      : await crearPlanificacion(payload);
    setOcupado(false);
    if (res.ok) {
      setBorrador(null);
      localStorage.removeItem(claveBorrador);
      setEstadoLocal("inactivo");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function borrar(p: Plan) {
    const ok = await confirmar({
      titulo: `¿Eliminar "${p.titulo}"?`,
      textoConfirmar: "Eliminar",
      peligro: true,
    });
    if (!ok) return;
    const res = await eliminarPlanificacion(asignaturaId, p.id);
    if (res.ok) {
      toast.exito("Planificación eliminada.");
      router.refresh();
    } else toast.error(res.error);
  }

  // Duplica un plan (útil para clases parecidas de una unidad — como en Lirmi).
  async function duplicar(p: Plan) {
    const res = await crearPlanificacion({
      asignaturaId,
      tipo: p.tipo,
      titulo: `${p.titulo} (copia)`,
      descripcion: p.descripcion || undefined,
      fechaInicio: p.fechaInicio || null,
      fechaFin: p.fechaFin || null,
      fechaClase: p.fechaClase || null,
      estadoClase: p.estadoClase ?? null,
      padreId: p.padreId || null,
      oaCodigos: p.oaCodigos,
    });
    if (res.ok) router.refresh();
    else toast.error(res.error);
  }

  async function convertirPlantilla(p: Plan) {
    const res = await guardarComoPlantilla(p.id);
    if (res.ok) { toast.exito("Plantilla guardada."); router.refresh(); }
    else toast.error(res.error);
  }

  function abrirDesdePlantilla(p: Plan) {
    setError(null);
    setBorrador({ id: null, versionOrigen: null, tipo: p.tipo, titulo: p.titulo, descripcion: p.descripcion ?? "", fechaInicio: "", fechaFin: "", fechaClase: "", estadoClase: "PLANIFICADA", padreId: "", oaCodigos: p.oaCodigos });
  }

  function cancelarBorrador() {
    localStorage.removeItem(claveBorrador);
    setBorrador(null);
    setEstadoLocal("inactivo");
    setError(null);
  }

  function toggleOa(codigo: string) {
    setBorrador((b) =>
      b
        ? {
            ...b,
            oaCodigos: b.oaCodigos.includes(codigo)
              ? b.oaCodigos.filter((c) => c !== codigo)
              : [...b.oaCodigos, codigo],
          }
        : b
    );
  }

  // Tarjeta de un plan (anual, unidad o clase), reutilizable en la vista anidada.
  const tarjetaPlan = (p: Plan) => (
    <div
      key={p.id}
      className="rounded-xl border border-borde bg-superficie p-4 shadow-suave"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-block rounded-lg border px-2 py-0.5 text-xs font-semibold ${TIPO_UI[p.tipo].badge}`}
          >
            {TIPO_UI[p.tipo].label}
          </span>
          <p className="mt-1 font-semibold text-tinta">{p.titulo}</p>
        </div>
        {puedeEditar && (
          <div className="flex shrink-0 gap-3 text-xs font-medium">
            <button
              type="button"
              onClick={() => abrirEdicion(p)}
              className="text-tinta-tenue hover:text-tinta"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => void duplicar(p)}
              className="text-tinta-tenue hover:text-tinta"
            >
              Duplicar
            </button>
            <button type="button" onClick={() => void convertirPlantilla(p)} className="text-tinta-tenue hover:text-marca-700">Plantilla</button>
            <button
              type="button"
              onClick={() => void borrar(p)}
              className="text-tinta-tenue hover:text-peligro"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
      {p.descripcion && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-tinta-suave">
          {p.descripcion}
        </p>
      )}
      {p.oaCodigos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.oaCodigos.map((c) => (
            <span
              key={c}
              className="rounded-md bg-superficie-3 px-1.5 py-0.5 font-mono text-xs font-medium text-tinta-tenue"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const plantillas = planificaciones.filter((p) => p.esPlantilla);
  const planes = planificaciones.filter((p) => !p.esPlantilla);
  const anuales = planes.filter((p) => p.tipo === "ANUAL");
  const unidades = planes.filter((p) => p.tipo === "UNIDAD");
  const clasesDe = (unidadId: string) =>
    planes.filter((p) => p.tipo === "CLASE" && p.padreId === unidadId);
  const clasesSueltas = planes.filter(
    (p) =>
      p.tipo === "CLASE" &&
      (!p.padreId || !unidades.some((u) => u.id === p.padreId))
  );
  const color = colorAsignatura(asignaturaNombre, asignaturaColor);
  const mesSeleccionado = MESES.find((mes) => mes.numero === mesActivo) ?? MESES[0];
  const unidadesDelMes = unidades.filter((unidad) =>
    planPerteneceAlMes(unidad, anioEscolar, mesActivo)
  );
  const unidadesSinFecha = unidades.filter(
    (unidad) => !unidad.fechaInicio && !unidad.fechaFin
  );
  const clasesConFechaDelMes = planes.filter(
    (plan) =>
      plan.tipo === "CLASE" && planPerteneceAlMes(plan, anioEscolar, mesActivo)
  ).length;
  const capacidadMes = clasesPorMes[mesActivo] ?? 0;

  const cantidadSugerida = (unidadId: string) => {
    if (!tieneHorarioPublicado) return 4;
    if (!feriadosVerificados) return null;
    const clasesFechadasEnMes = clasesDe(unidadId).filter((clase) =>
      planPerteneceAlMes(clase, anioEscolar, mesActivo)
    ).length;
    const pendientes = capacidadMes - clasesFechadasEnMes;
    return pendientes > 0 ? Math.min(12, pendientes) : null;
  };

  return (
    <div className="mt-6">
      {puedeEditar && !borrador && (
        <div className="flex flex-wrap items-center gap-2">
          <Boton type="button" onClick={abrirNueva}>+ Nueva unidad</Boton>
          {plantillas.map((plantilla) => <button key={plantilla.id} type="button" onClick={() => abrirDesdePlantilla(plantilla)} className="rounded-xl border border-borde bg-superficie px-3 py-2 text-sm font-medium text-tinta-suave shadow-suave hover:bg-superficie-2">Desde {plantilla.titulo}</button>)}
        </div>
      )}

      {borrador && (
        <div className="rounded-xl border border-borde bg-superficie p-4 shadow-suave">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-medium text-tinta-tenue">
              Tipo
              <select
                value={borrador.tipo}
                onChange={(e) =>
                  setBorrador({ ...borrador, tipo: e.target.value as TipoPlanificacion })
                }
                className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
              >
                {ORDEN.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_UI[t].label}
                  </option>
                ))}
              </select>
            </label>
            {borrador.tipo !== "ANUAL" && posiblesPadres.length > 0 && (
              <label className="text-xs font-medium text-tinta-tenue">
                Depende de
                <select
                  value={borrador.padreId}
                  onChange={(e) =>
                    setBorrador({ ...borrador, padreId: e.target.value })
                  }
                  className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
                >
                  <option value="">— (independiente)</option>
                  {posiblesPadres
                    .filter((p) => p.id !== borrador.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {TIPO_UI[p.tipo].label}: {p.titulo}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          <input
            value={borrador.titulo}
            onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })}
            placeholder="Título (ej. Unidad 1: Números y operaciones)"
            className="mt-3 w-full rounded-lg border border-borde px-3 py-2 text-sm"
          />
          <textarea
            value={borrador.descripcion}
            onChange={(e) => setBorrador({ ...borrador, descripcion: e.target.value })}
            rows={2}
            placeholder="Descripción, actividades, evaluación… (sin datos personales de estudiantes)"
            className="mt-2 w-full rounded-lg border border-borde px-3 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="text-xs font-medium text-tinta-tenue">
              Desde
              <input
                type="date"
                value={borrador.fechaInicio}
                onChange={(e) =>
                  setBorrador({ ...borrador, fechaInicio: e.target.value })
                }
                className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-tinta-tenue">
              Hasta
              <input
                type="date"
                value={borrador.fechaFin}
                onChange={(e) =>
                  setBorrador({ ...borrador, fechaFin: e.target.value })
                }
                className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {borrador.tipo === "CLASE" && (
            <div className="mt-2 flex flex-wrap gap-3 rounded-lg border border-borde bg-superficie-2 p-3">
              <label className="text-xs font-medium text-tinta-tenue">
                Fecha de la clase
                <input
                  type="date"
                  value={borrador.fechaClase}
                  onChange={(e) =>
                    setBorrador({ ...borrador, fechaClase: e.target.value })
                  }
                  className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-tinta-tenue">
                Estado
                <select
                  value={borrador.estadoClase}
                  onChange={(e) =>
                    setBorrador({ ...borrador, estadoClase: e.target.value as EstadoClasePlan })
                  }
                  className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
                >
                  {(Object.keys(ESTADO_CLASE_UI) as EstadoClasePlan[]).map((estado) => (
                    <option key={estado} value={estado}>
                      {ESTADO_CLASE_UI[estado].label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {oaDisponibles.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOaAbierto((v) => !v)}
                className="text-sm font-medium text-tinta hover:underline"
              >
                OA vinculados ({borrador.oaCodigos.length}) {oaAbierto ? "▲" : "▼"}
              </button>
              {oaAbierto && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-borde p-2">
                  {oaDisponibles.map((oa) => (
                    <label
                      key={oa.codigo}
                      className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 text-sm hover:bg-superficie-2"
                    >
                      <input
                        type="checkbox"
                        checked={borrador.oaCodigos.includes(oa.codigo)}
                        onChange={() => toggleOa(oa.codigo)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-mono text-xs font-semibold text-tinta">
                          {oa.codigo}
                        </span>
                        <span className="ml-1 text-tinta-tenue">{oa.descripcion}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-2 text-sm text-peligro">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={ocupado || borrador.titulo.trim().length < 3}
              className="btn btn-primario"
            >
              {ocupado ? "Guardando…" : "Guardar"}
            </button>
            {estadoLocal !== "inactivo" && <span className="self-center text-xs font-medium text-exito">✓ {estadoLocal === "recuperado" ? "Borrador recuperado" : "Borrador guardado en este dispositivo"}</span>}
            <button
              type="button"
              onClick={cancelarBorrador}
              className="text-sm text-tinta-tenue hover:text-tinta"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <section className="mt-6" aria-labelledby="vista-anual-titulo">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
              <span className={`h-2.5 w-2.5 rounded-full ${color.punto}`} aria-hidden />
              Año escolar {anioEscolar}
            </p>
            <h2 id="vista-anual-titulo" className="mt-1 font-display text-xl font-semibold tracking-tight text-tinta">
              Plan mensual, de marzo a diciembre
            </h2>
          </div>
          {!tieneHorarioPublicado && (
            <span className="insignia insignia-alerta">
              Sin horario publicado: capacidad pendiente
            </span>
          )}
          {tieneHorarioPublicado && !feriadosVerificados && (
            <span className="insignia insignia-alerta">
              Feriados de {anioEscolar} pendientes de verificar
            </span>
          )}
        </div>

        {iaActiva && puedeEditar && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-marca-200 bg-marca-50 p-3 text-marca-800">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-superficie shadow-suave" aria-hidden>
              ✨
            </span>
            <div>
              <p className="text-sm font-semibold">Asistente IA disponible</p>
              <p className="mt-0.5 text-xs leading-relaxed text-marca-700">
                En cada unidad puedes crear una secuencia editable. La cantidad se sugiere con los bloques libres del mes seleccionado.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10" aria-label="Meses del año escolar">
          {MESES.map((mes) => {
            const activo = mes.numero === mesActivo;
            const unidadesMes = unidades.filter((unidad) =>
              planPerteneceAlMes(unidad, anioEscolar, mes.numero)
            ).length;
            return (
              <button
                key={mes.numero}
                type="button"
                aria-pressed={activo}
                onClick={() => setMesActivo(mes.numero)}
                className={`min-h-16 rounded-xl border px-2 py-2 text-left transition-colors ${
                  activo
                    ? `${color.suave} border-current shadow-suave`
                    : "border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:bg-superficie-2"
                }`}
              >
                <span className="block text-xs font-semibold uppercase tracking-wide">{mes.corto}</span>
                <span className="mt-1 block text-[11px] tabular-nums opacity-80">
                  {tieneHorarioPublicado
                    ? feriadosVerificados
                      ? `${clasesPorMes[mes.numero] ?? 0} clases`
                      : "Cálculo pendiente"
                    : "Sin cálculo"}
                </span>
                <span className="sr-only">{unidadesMes} unidades planificadas</span>
              </button>
            );
          })}
        </div>

        <div id="unidades-mes" className="mt-5 scroll-mt-24">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-superficie-2 px-4 py-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-tinta">{mesSeleccionado.nombre}</h3>
              <p className="text-xs text-tinta-tenue">
                {tieneHorarioPublicado && feriadosVerificados
                  ? `${capacidadMes} ${capacidadMes === 1 ? "clase disponible" : "clases disponibles"} según horario y calendario`
                  : tieneHorarioPublicado
                    ? `Verifica los feriados de ${anioEscolar} para calcular la capacidad del mes`
                    : "Publica un horario para calcular automáticamente la capacidad del mes"}
                {clasesConFechaDelMes > 0
                  ? ` · ${clasesConFechaDelMes} con fecha planificada`
                  : ""}
              </p>
            </div>
            {puedeEditar && (
              <div className="flex flex-wrap items-center gap-2">
                {iaActiva && (
                  <Boton
                    type="button"
                    tamano="sm"
                    onClick={() => setPanelUnidadIA((v) => !v)}
                    aria-expanded={panelUnidadIA}
                  >
                    ✨ Proponer unidad con IA
                  </Boton>
                )}
                <Boton type="button" variante="secundario" tamano="sm" onClick={abrirNuevaEnMes}>
                  + Unidad en {mesSeleccionado.nombre.toLowerCase()}
                </Boton>
              </div>
            )}
          </div>

          {panelUnidadIA && puedeEditar && iaActiva && (
            <div className="mt-3 rounded-xl border border-marca-200 bg-marca-50/70 p-3">
              <p className="text-sm font-semibold text-marca-800">
                ✨ Unidad de {mesSeleccionado.nombre.toLowerCase()} con IA
              </p>
              <p className="mt-0.5 text-xs text-marca-700">
                Propone título, objetivos con OA del nivel, actividades y evaluación sugerida,
                dimensionada a las clases del mes. Tú revisas, ajustas y guardas.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={indicacionesIA}
                  onChange={(e) => setIndicacionesIA(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !proponiendoUnidad) void proponerUnidadIA();
                  }}
                  placeholder="Opcional: tema o indicaciones (ej. 'fracciones, con material concreto')"
                  className="min-h-11 flex-1 rounded-lg border border-marca-200 bg-superficie px-3 py-2 text-sm"
                  disabled={proponiendoUnidad}
                />
                <Boton
                  type="button"
                  tamano="sm"
                  disabled={proponiendoUnidad}
                  onClick={() => void proponerUnidadIA()}
                >
                  {proponiendoUnidad ? "Generando…" : "Generar propuesta"}
                </Boton>
              </div>
              {error && <p className="mt-2 text-sm text-peligro">{error}</p>}
            </div>
          )}

          {unidadesDelMes.length === 0 ? (
            <div className="mt-3">
              <EstadoVacio
                icono="planificacion"
                titulo={`Aún no hay unidades en ${mesSeleccionado.nombre.toLowerCase()}`}
                descripcion={
                  puedeEditar
                    ? "Crea una unidad con su propósito y rango. Las clases quedarán ordenadas dentro de ella."
                    : "Cuando el equipo docente planifique este mes, las unidades aparecerán aquí."
                }
              />
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {unidadesDelMes.map((unidad) => {
                const clasesUnidad = clasesDe(unidad.id);
                const claveSugerencia = `${unidad.id}:${mesActivo}`;
                const sugeridas =
                  numIA[claveSugerencia] ?? cantidadSugerida(unidad.id);
                return (
                  <article key={unidad.id} className="superficie overflow-hidden rounded-xl">
                    <div className="flex">
                      <span className={`w-1.5 shrink-0 ${color.punto}`} aria-hidden />
                      <div className="min-w-0 flex-1 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="insignia insignia-marca">Unidad</span>
                              <span className="text-xs font-medium text-tinta-tenue">{formatearRango(unidad)}</span>
                            </div>
                            <h4 className="mt-2 font-display text-lg font-semibold leading-tight text-tinta">{unidad.titulo}</h4>
                            <p className="mt-1 text-sm leading-relaxed text-tinta-suave">
                              {unidad.descripcion?.trim() || "Agrega una descripción para que el propósito de la unidad sea claro."}
                            </p>
                          </div>
                          {puedeEditar && (
                            <div className="grid shrink-0 grid-cols-2 gap-1 sm:flex" aria-label={`Acciones para ${unidad.titulo}`}>
                              <Boton type="button" variante="fantasma" tamano="sm" onClick={() => abrirEdicion(unidad)}>Editar</Boton>
                              <Boton type="button" variante="fantasma" tamano="sm" onClick={() => void duplicar(unidad)}>Duplicar</Boton>
                              <Boton type="button" variante="fantasma" tamano="sm" onClick={() => void convertirPlantilla(unidad)}>Plantilla</Boton>
                              <Boton type="button" variante="fantasma" tamano="sm" className="text-peligro" onClick={() => void borrar(unidad)}>Eliminar</Boton>
                            </div>
                          )}
                        </div>

                        <div className="mt-4 border-t border-borde pt-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                              {clasesUnidad.length} {clasesUnidad.length === 1 ? "clase planificada" : "clases planificadas"}
                            </p>
                            {puedeEditar && (
                              <button type="button" onClick={() => abrirClaseDe(unidad.id)} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-marca-600 hover:bg-marca-50 hover:text-marca-700">
                                + Agregar clase
                              </button>
                            )}
                          </div>

                          {puedeEditar && tieneHorarioPublicado && (
                            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-borde bg-superficie-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2 text-sm text-tinta-suave">
                                <span aria-hidden>📅</span>
                                <span>
                                  <strong className="text-tinta">Auto-cronograma</strong> · agenda las clases en tu horario, salta feriados y suspensiones
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="sr-only" htmlFor={`cantidad-cron-${unidad.id}`}>Cantidad de clases a agendar</label>
                                <select
                                  id={`cantidad-cron-${unidad.id}`}
                                  value={numCron[unidad.id] ?? Math.min(8, Math.max(1, capacidadMes || 4))}
                                  onChange={(evento) => setNumCron((actual) => ({ ...actual, [unidad.id]: Number(evento.target.value) }))}
                                  disabled={generandoCron !== null}
                                  className="min-h-11 rounded-lg border border-borde bg-superficie px-2 text-sm text-tinta"
                                >
                                  {Array.from({ length: 20 }, (_, indice) => indice + 1).map((cantidad) => (
                                    <option key={cantidad} value={cantidad}>{cantidad} {cantidad === 1 ? "clase" : "clases"}</option>
                                  ))}
                                </select>
                                <Boton
                                  type="button"
                                  variante="secundario"
                                  tamano="sm"
                                  disabled={generandoCron !== null}
                                  onClick={() => void generarCronograma(unidad.id, numCron[unidad.id] ?? Math.min(8, Math.max(1, capacidadMes || 4)))}
                                >
                                  {generandoCron === unidad.id ? "Agendando…" : "Generar cronograma"}
                                </Boton>
                              </div>
                            </div>
                          )}

                          {clasesUnidad.length > 0 && (
                            <ol className="mt-2 space-y-2">
                              {clasesUnidad.map((clase, indice) => (
                                <li key={clase.id} className="rounded-xl border border-borde bg-superficie-2 p-3">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <span className={`inline-flex w-fit shrink-0 items-center rounded-lg px-2 py-1 text-xs font-semibold ${color.suave}`}>
                                      Clase {clase.ordenClase ?? indice + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="truncate text-sm font-semibold text-tinta">{clase.titulo}</p>
                                        {clase.estadoClase && (
                                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${ESTADO_CLASE_UI[clase.estadoClase].clase}`}>
                                            {ESTADO_CLASE_UI[clase.estadoClase].label}
                                          </span>
                                        )}
                                        {clase.fechaClase && (
                                          <span className="shrink-0 text-[11px] font-medium tabular-nums text-tinta-tenue">
                                            {formatearRango({ ...clase, fechaInicio: clase.fechaClase, fechaFin: clase.fechaClase })}
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-0.5 line-clamp-2 text-xs text-tinta-tenue">
                                        {clase.descripcion?.trim() || "Contenido por completar"}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {puedeEditar && (
                                        <Boton type="button" variante="fantasma" tamano="sm" onClick={() => abrirEdicion(clase)}>Editar</Boton>
                                      )}
                                      {puedeEditar && (
                                        <Boton type="button" variante="fantasma" tamano="sm" onClick={() => void duplicar(clase)}>Duplicar</Boton>
                                      )}
                                      <Link
                                        href={`/libro-clases/firma?asignaturaId=${asignaturaId}&planificacionId=${clase.id}#registrar-clase`}
                                        className="btn btn-secundario btn-sm min-h-11"
                                        aria-label={`Copiar ${unidad.titulo}, clase ${indice + 1}, al leccionario`}
                                      >
                                        <Iconos.firma className="h-4 w-4" />
                                        Copiar al leccionario
                                      </Link>
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ol>
                          )}

                          {puedeEditar && iaActiva && (
                            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-marca-200 bg-marca-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2 text-sm text-marca-800">
                                <span aria-hidden>✨</span>
                                <span><strong>Asistente IA</strong> · secuencia editable para esta unidad</span>
                              </div>
                              {sugeridas === null ? (
                                <span className="text-xs font-medium text-marca-700">
                                  Sin bloques disponibles en este mes
                                </span>
                              ) : (
                              <div className="flex items-center gap-2">
                                <label className="sr-only" htmlFor={`cantidad-ia-${unidad.id}`}>Cantidad de clases a generar</label>
                                <select
                                  id={`cantidad-ia-${unidad.id}`}
                                  value={sugeridas}
                                  onChange={(evento) => setNumIA((actual) => ({ ...actual, [claveSugerencia]: Number(evento.target.value) }))}
                                  disabled={generandoIA !== null}
                                  className="min-h-11 rounded-lg border border-marca-200 bg-superficie px-2 text-sm text-tinta"
                                >
                                  {Array.from({ length: 12 }, (_, indice) => indice + 1).map((cantidad) => (
                                    <option key={cantidad} value={cantidad}>{cantidad} {cantidad === 1 ? "clase" : "clases"}</option>
                                  ))}
                                </select>
                                <Boton
                                  type="button"
                                  tamano="sm"
                                  disabled={generandoIA !== null}
                                  onClick={() => void generarClasesIA(unidad.id, sugeridas)}
                                >
                                  {generandoIA === unidad.id ? "Generando…" : "Generar borrador"}
                                </Boton>
                              </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {unidadesSinFecha.length > 0 && (
        <details className="mt-6 rounded-xl border border-borde bg-superficie p-4">
          <summary className="cursor-pointer text-sm font-semibold text-tinta">
            Unidades con fechas por definir ({unidadesSinFecha.length})
          </summary>
          <div className="mt-3 space-y-2">{unidadesSinFecha.map(tarjetaPlan)}</div>
        </details>
      )}

      {(anuales.length > 0 || clasesSueltas.length > 0) && (
        <details className="mt-3 rounded-xl border border-borde bg-superficie p-4">
          <summary className="cursor-pointer text-sm font-semibold text-tinta">
            Plan anual y elementos sin ordenar ({anuales.length + clasesSueltas.length})
          </summary>
          <div className="mt-3 space-y-2">
            {anuales.map(tarjetaPlan)}
            {clasesSueltas.map(tarjetaPlan)}
          </div>
        </details>
      )}
    </div>
  );
}
