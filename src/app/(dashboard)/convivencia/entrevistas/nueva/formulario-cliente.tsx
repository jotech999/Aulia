"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearEntrevista } from "../actions";
import { Boton } from "@/components/ui/boton";

type ApoderadoOpcion = {
  id: string;
  nombre: string;
  parentesco: string;
  tipo: "Titular" | "Suplente" | "Por confirmar";
};

type Opcion = {
  id: string;
  nombre: string;
  curso: string;
  apoderados: ApoderadoOpcion[];
};

const MOTIVOS = [
  "Asistencia e inasistencias",
  "Atrasos o retiros anticipados",
  "Rendimiento académico",
  "Situación de salud informada por la familia",
  "Convivencia o disrupción en el aula",
  "Dificultad de aprendizaje",
  "Apoyo socioemocional",
  "Seguimiento de acuerdos",
  "Otro",
] as const;

const campo =
  "mt-1.5 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";

export function FormularioEntrevista({
  estudiantes,
  preseleccion,
  hoy,
}: {
  estudiantes: Opcion[];
  preseleccion?: string;
  hoy: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const estudianteInicial = preseleccion && estudiantes.some((e) => e.id === preseleccion)
    ? preseleccion
    : estudiantes[0]?.id ?? "";
  const [estudianteId, setEstudianteId] = useState(estudianteInicial);
  const [motivoBase, setMotivoBase] = useState<string>(MOTIVOS[0]);
  const [motivoOtro, setMotivoOtro] = useState("");
  const estudiante = estudiantes.find((opcion) => opcion.id === estudianteId);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const apoderadoId = String(fd.get("apoderadoId") ?? "");
    const apoderadoVinculado = estudiante?.apoderados.find(
      (opcion) => opcion.id === apoderadoId
    );
    const input = {
      estudianteId,
      apoderadoId,
      apoderado: apoderadoVinculado?.nombre ?? String(fd.get("apoderado") ?? ""),
      calidadSnapshot: apoderadoVinculado
        ? `${apoderadoVinculado.tipo} · ${apoderadoVinculado.parentesco}`
        : "Registro manual",
      motivo: motivoBase === "Otro" ? motivoOtro : motivoBase,
      acuerdos: String(fd.get("acuerdos") ?? ""),
      compromisos: String(fd.get("compromisos") ?? ""),
      fecha: String(fd.get("fecha") ?? ""),
      proximaCita: String(fd.get("proximaCita") ?? ""),
    };
    startTransition(async () => {
      const res = await crearEntrevista(input);
      if (res.ok) {
        router.push(`/admin/estudiantes/${input.estudianteId}`);
      } else {
        setError(res.error);
      }
    });
  }

  if (estudiantes.length === 0) {
    return (
      <p className="superficie rounded-xl px-5 py-6 text-sm text-tinta-suave">
        No tienes estudiantes a tu cargo para registrar una entrevista.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="superficie space-y-4 rounded-xl p-5">
      {error && (
        <p role="alert" className="rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2.5 text-sm text-peligro">
          {error}
        </p>
      )}

      <p className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
        Datos de la reunión
      </p>

      <div>
        <label htmlFor="estudianteId" className="block text-sm font-medium">Estudiante</label>
        <select
          id="estudianteId"
          name="estudianteId"
          required
          value={estudianteId}
          onChange={(evento) => setEstudianteId(evento.target.value)}
          className={campo}
        >
          <option value="" disabled>Elige un estudiante…</option>
          {estudiantes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}{e.curso ? ` · ${e.curso}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="apoderado" className="block text-sm font-medium">Apoderado presente</label>
          {estudiante?.apoderados.length ? (
            <select
              key={estudianteId}
              id="apoderado"
              name="apoderadoId"
              required
              defaultValue={estudiante.apoderados[0]?.id ?? ""}
              className={campo}
            >
              {estudiante.apoderados.map((apoderado) => (
                <option key={apoderado.id} value={apoderado.id}>
                  {apoderado.nombre} · {apoderado.tipo} ({apoderado.parentesco})
                </option>
              ))}
            </select>
          ) : (
            <input
              id="apoderado"
              name="apoderado"
              required
              maxLength={120}
              className={campo}
              placeholder="Nombre del apoderado presente"
            />
          )}
          <p className="mt-1 text-xs text-tinta-tenue">
            {estudiante?.apoderados.length
              ? "Se cargaron los contactos asociados a la matrícula."
              : "Este estudiante aún no tiene apoderados asociados; registra el nombre manualmente."}
          </p>
        </div>
        <div>
          <label htmlFor="fecha" className="block text-sm font-medium">Fecha</label>
          <input id="fecha" name="fecha" type="date" required defaultValue={hoy} max={hoy} className={campo} />
        </div>
      </div>

      <div>
        <label htmlFor="motivo" className="block text-sm font-medium">Motivo</label>
        <select
          id="motivo"
          name="motivoBase"
          value={motivoBase}
          onChange={(evento) => setMotivoBase(evento.target.value)}
          className={campo}
        >
          {MOTIVOS.map((motivo) => <option key={motivo}>{motivo}</option>)}
        </select>
        {motivoBase === "Otro" && (
          <input
            name="motivoOtro"
            value={motivoOtro}
            onChange={(evento) => setMotivoOtro(evento.target.value)}
            required
            maxLength={300}
            className={campo}
            placeholder="Describe brevemente el motivo"
          />
        )}
      </div>

      <p className="border-t border-borde pt-4 text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
        Acuerdos y seguimiento
      </p>

      <div>
        <label htmlFor="acuerdos" className="block text-sm font-medium">Síntesis de lo conversado y acuerdos</label>
        <textarea id="acuerdos" name="acuerdos" rows={4} maxLength={3000} className={campo} placeholder="Registra los temas tratados y los acuerdos alcanzados" />
      </div>

      <div>
        <label htmlFor="compromisos" className="block text-sm font-medium">Compromisos</label>
        <textarea id="compromisos" name="compromisos" rows={3} maxLength={3000} className={campo} placeholder="Compromisos del apoderado / colegio" />
      </div>

      <div>
        <label htmlFor="proximaCita" className="block text-sm font-medium">
          Próxima cita <span className="text-tinta-tenue">(opcional)</span>
        </label>
        <input id="proximaCita" name="proximaCita" type="date" className={campo} />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Registrar entrevista"}
        </Boton>
      </div>
    </form>
  );
}
