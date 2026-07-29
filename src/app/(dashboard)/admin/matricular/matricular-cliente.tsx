"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearMatricula } from "./actions";
import { toast } from "@/components/ui/toast";

type Curso = { id: string; etiqueta: string };
const campo =
  "mt-1 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-200";
const label = "block text-xs font-medium text-tinta-suave";

type Inicial = {
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  apoderadoNombre: string;
  apoderadoEmail: string;
  nivelSolicitado?: string;
};

export function MatricularForm({ cursos, inicial }: { cursos: Curso[]; inicial?: Inicial }) {
  const router = useRouter();
  // Si viene de admisión, la sección de apoderado parte abierta y precargada.
  const [conApoderado, setConApoderado] = useState(Boolean(inicial?.apoderadoNombre));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    setClave(null);
    const fd = new FormData(e.currentTarget);
    const input: Record<string, unknown> = {
      rut: fd.get("rut"),
      nombres: fd.get("nombres"),
      apellidos: fd.get("apellidos"),
      fechaNacimiento: fd.get("fechaNacimiento"),
      cursoId: fd.get("cursoId"),
    };
    if (conApoderado) {
      input.apoderado = {
        rut: fd.get("apo_rut"),
        nombre: fd.get("apo_nombre"),
        email: fd.get("apo_email"),
        parentesco: fd.get("apo_parentesco"),
      };
    }
    const res = await crearMatricula(input);
    setOcupado(false);
    if (res.ok) {
      toast.exito("Estudiante matriculado.");
      if (res.apoderadoClaveTemporal) {
        setClave(res.apoderadoClaveTemporal);
      } else {
        router.push("/admin/estudiantes");
      }
    } else {
      setError(res.error);
    }
  }

  if (clave) {
    return (
      <div className="mt-6 rounded-xl border border-exito/25 bg-exito-suave p-5">
        <p className="font-semibold text-tinta">Estudiante matriculado y apoderado creado.</p>
        <p className="mt-2 text-sm text-tinta-suave">
          Comparte esta clave temporal con el apoderado para su primer acceso (podrá cambiarla luego):
        </p>
        <p className="mt-2 rounded-lg border border-borde bg-superficie px-3 py-2 font-mono text-lg font-bold tracking-wider text-tinta">
          {clave}
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={() => router.push("/admin/estudiantes")} className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-semibold text-white hover:bg-marca-700">
            Ir a estudiantes
          </button>
          <button onClick={() => { setClave(null); router.refresh(); }} className="rounded-lg border border-borde px-4 py-2 text-sm font-semibold text-tinta-suave hover:bg-superficie-2">
            Matricular otro
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <section className="rounded-xl border border-borde bg-superficie p-4">
        <h2 className="text-sm font-semibold text-tinta">Estudiante</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>RUT<input name="rut" required placeholder="12345678-9" className={campo} /></label>
          <label className={label}>Curso
            <select name="cursoId" required defaultValue="" className={campo}>
              <option value="" disabled>Selecciona…</option>
              {cursos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
            </select>
          </label>
          <label className={label}>Nombres<input name="nombres" required maxLength={120} defaultValue={inicial?.nombres} className={campo} /></label>
          <label className={label}>Apellidos<input name="apellidos" required maxLength={120} defaultValue={inicial?.apellidos} className={campo} /></label>
          <label className={label}>Fecha de nacimiento (opcional)<input name="fechaNacimiento" type="date" defaultValue={inicial?.fechaNacimiento} className={campo} /></label>
        </div>
      </section>

      <section className="rounded-xl border border-borde bg-superficie p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-tinta">
          <input type="checkbox" checked={conApoderado} onChange={(e) => setConApoderado(e.target.checked)} className="h-4 w-4" />
          Agregar apoderado ahora
        </label>
        {conApoderado && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={label}>RUT<input name="apo_rut" placeholder="12345678-9" className={campo} /></label>
            <label className={label}>Parentesco
              <select name="apo_parentesco" defaultValue="madre" className={campo}>
                <option value="madre">Madre</option>
                <option value="padre">Padre</option>
                <option value="tutor">Tutor/a</option>
              </select>
            </label>
            <label className={label}>Nombre<input name="apo_nombre" maxLength={120} defaultValue={inicial?.apoderadoNombre} className={campo} /></label>
            <label className={label}>Email<input name="apo_email" type="email" defaultValue={inicial?.apoderadoEmail} className={campo} /></label>
            <p className="text-[11px] text-tinta-tenue sm:col-span-2">
              Si el apoderado ya tiene cuenta (mismo email), se enlaza; si no, se crea y verás una clave temporal para compartirle.
            </p>
          </div>
        )}
      </section>

      {error && <p className="rounded-lg bg-peligro-suave px-3 py-2 text-sm text-peligro">{error}</p>}

      <button type="submit" disabled={ocupado} className="w-full rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-marca-700 disabled:opacity-50">
        {ocupado ? "Matriculando…" : "Matricular estudiante"}
      </button>
    </form>
  );
}
