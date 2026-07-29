"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { claveBorradorComunicado, NOMBRE_ALCANCE, type Alcance } from "@/lib/comunicados";
import { crearComunicado } from "./actions";
import { Boton } from "@/components/ui/boton";
import { toast } from "@/components/ui/toast";
import { fechaHoraLocalSantiago } from "@/lib/fecha-hora-santiago";

type Curso = { id: string; nivel: string; letra: string };
type Estudiante = { id: string; nombre: string };

export function CrearComunicado({
  alcances,
  cursos,
  niveles,
  estudiantes,
  plantillas,
  contextoBorrador,
}: {
  alcances: Alcance[];
  cursos: Curso[];
  niveles: string[];
  estudiantes: Estudiante[];
  plantillas: Array<{ nombre: string; titulo: string; cuerpo: string }>;
  contextoBorrador: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [alcance, setAlcance] = useState<Alcance>(alcances[0] ?? "CURSO");
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [nivel, setNivel] = useState(niveles[0] ?? "");
  const [cursoId, setCursoId] = useState(cursos[0]?.id ?? "");
  const [estudianteId, setEstudianteId] = useState(estudiantes[0]?.id ?? "");
  const [estudianteIds, setEstudianteIds] = useState<string[]>([]);
  const [programadoPara, setProgramadoPara] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const claveBorrador = claveBorradorComunicado(contextoBorrador);

  useEffect(() => {
    const borrador = localStorage.getItem(claveBorrador);
    if (!borrador) return;
    try {
      const datos = JSON.parse(borrador) as { titulo?: string; cuerpo?: string };
      if (datos.titulo || datos.cuerpo) {
        setTitulo(datos.titulo ?? ""); setCuerpo(datos.cuerpo ?? "");
        toast.info("Recuperamos tu borrador local.");
      }
    } catch { localStorage.removeItem(claveBorrador); }
  }, [claveBorrador]);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      if (titulo || cuerpo) localStorage.setItem(claveBorrador, JSON.stringify({ titulo, cuerpo }));
    }, 350);
    return () => window.clearTimeout(temporizador);
  }, [titulo, cuerpo, claveBorrador]);

  if (alcances.length === 0) return null;

  async function enviar(comoPlantilla = false) {
    setOcupado(true);
    setMsg(null);
    const res = await crearComunicado({
      titulo,
      cuerpo,
      alcance,
      nivel: alcance === "NIVEL" ? nivel : null,
      cursoId: alcance === "CURSO" ? cursoId : null,
      estudianteId: alcance === "ESTUDIANTE" ? estudianteId : null,
      estudianteIds: alcance === "SELECCION" ? estudianteIds : [],
      programadoPara: programadoPara || null,
      esPlantilla: comoPlantilla,
      nombrePlantilla: comoPlantilla ? titulo : null,
    });
    setOcupado(false);
    if (res.ok) {
      setTitulo("");
      setCuerpo("");
      setAbierto(false);
      setMsg(null);
      setProgramadoPara("");
      setEstudianteIds([]);
      localStorage.removeItem(claveBorrador);
      router.refresh();
      if (comoPlantilla) toast.exito("Plantilla guardada para reutilizar.");
      else if (programadoPara) toast.exito(`Comunicado programado para ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(programadoPara))}.`);
      else if (res.destinatarios === 0) toast.advertencia("Comunicado creado, pero no hay apoderados registrados para ese alcance.");
      else toast.exito(`Comunicado enviado a ${res.destinatarios} apoderado(s).`);
    } else {
      setMsg(res.error);
    }
  }

  if (!abierto) {
    return (
      <Boton type="button" onClick={() => setAbierto(true)}>
        + Nuevo comunicado
      </Boton>
    );
  }

  return (
    <div className="rounded-xl border border-borde bg-superficie p-4 shadow-suave">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-tinta-tenue">
          Alcance
          <select
            value={alcance}
            onChange={(e) => setAlcance(e.target.value as Alcance)}
            className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
          >
            {alcances.map((a) => (
              <option key={a} value={a}>
                {NOMBRE_ALCANCE[a]}
              </option>
            ))}
          </select>
        </label>

        {alcance === "NIVEL" && (
          <label className="text-xs font-medium text-tinta-tenue">
            Nivel
            <select
              value={nivel}
              onChange={(e) => setNivel(e.target.value)}
              className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
            >
              {niveles.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
        {alcance === "CURSO" && (
          <label className="text-xs font-medium text-tinta-tenue">
            Curso
            <select
              value={cursoId}
              onChange={(e) => setCursoId(e.target.value)}
              className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
            >
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>{c.nivel} {c.letra}</option>
              ))}
            </select>
          </label>
        )}
        {alcance === "ESTUDIANTE" && (
          <label className="text-xs font-medium text-tinta-tenue">
            Estudiante
            <select
              value={estudianteId}
              onChange={(e) => setEstudianteId(e.target.value)}
              className="mt-0.5 block rounded-lg border border-borde px-2 py-1.5 text-sm"
            >
              {estudiantes.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {plantillas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">Plantillas</span>
          {plantillas.map((p) => <button key={p.nombre} type="button" onClick={() => { setTitulo(p.titulo); setCuerpo(p.cuerpo); }} className="rounded-full border border-borde px-3 py-1 text-xs font-medium text-tinta-suave hover:bg-superficie-3">{p.nombre}</button>)}
        </div>
      )}

      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título del comunicado"
        className="mt-3 w-full rounded-lg border border-borde px-3 py-2 text-sm"
      />
      <textarea
        value={cuerpo}
        onChange={(e) => setCuerpo(e.target.value)}
        rows={4}
        placeholder="Mensaje a las familias. En alcance amplio no incluyas datos de un estudiante identificable ni datos de salud."
        className="mt-2 w-full rounded-lg border border-borde px-3 py-2 text-sm"
      />

      {alcance === "SELECCION" && (
        <fieldset className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-borde p-3">
          <legend className="px-1 text-xs font-semibold text-tinta-suave">Selecciona estudiantes ({estudianteIds.length})</legend>
          <div className="grid gap-1 sm:grid-cols-2">{estudiantes.map((e) => <label key={e.id} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-superficie-3"><input type="checkbox" checked={estudianteIds.includes(e.id)} onChange={() => setEstudianteIds((actual) => actual.includes(e.id) ? actual.filter((id) => id !== e.id) : [...actual, e.id])} /> <span className="truncate">{e.nombre}</span></label>)}</div>
        </fieldset>
      )}

      <label className="mt-3 grid max-w-sm gap-1 text-xs font-medium text-tinta-tenue">
        Programar envío (opcional)
          <input type="datetime-local" value={programadoPara} min={fechaHoraLocalSantiago(new Date())} onChange={(e) => setProgramadoPara(e.target.value)} className="min-h-11 rounded-lg border border-borde px-3 text-sm text-tinta" />
      </label>

      {msg && <p className="mt-2 text-sm text-peligro">{msg}</p>}

      <div className="mt-3 flex gap-2">
        <Boton
          type="button"
          onClick={() => void enviar(false)}
          disabled={ocupado || titulo.trim().length < 3 || cuerpo.trim().length < 5 || (alcance === "SELECCION" && estudianteIds.length === 0)}
        >
          {ocupado ? "Guardando…" : programadoPara ? "Programar comunicado" : "Enviar comunicado"}
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => void enviar(true)} disabled={ocupado || titulo.trim().length < 3 || cuerpo.trim().length < 5}>Guardar plantilla</Boton>
        <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}
