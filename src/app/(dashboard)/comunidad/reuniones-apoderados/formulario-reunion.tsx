"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { toast } from "@/components/ui/toast";
import { crearReunionApoderados } from "./actions";

type Contacto = {
  id: string;
  estudianteId: string;
  estudiante: string;
  nombre: string;
  parentesco: string;
  calidad: "TITULAR" | "SUPLENTE" | "SIN_CONFIRMAR";
};

const campo =
  "mt-1.5 w-full rounded-xl border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-200";

export function FormularioReunion({
  cursoId,
  cursoNombre,
  hoy,
  contactos,
}: {
  cursoId: string;
  cursoNombre: string;
  hoy: string;
  contactos: Contacto[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function alternar(id: string) {
    setSeleccionados((actuales) => {
      const siguientes = new Set(actuales);
      if (siguientes.has(id)) siguientes.delete(id);
      else siguientes.add(id);
      return siguientes;
    });
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const datos = new FormData(evento.currentTarget);
    const asistentes = contactos
      .filter((contacto) => seleccionados.has(contacto.id))
      .map((contacto) => ({
        apoderadoId: contacto.id,
        nombre: contacto.nombre,
        estudianteId: contacto.estudianteId,
      }));

    startTransition(async () => {
      const resultado = await crearReunionApoderados({
        cursoId,
        fecha: String(datos.get("fecha") ?? ""),
        horaInicio: String(datos.get("horaInicio") ?? ""),
        horaFin: String(datos.get("horaFin") ?? ""),
        tema: String(datos.get("tema") ?? ""),
        objetivo: String(datos.get("objetivo") ?? ""),
        acuerdos: String(datos.get("acuerdos") ?? ""),
        observaciones: String(datos.get("observaciones") ?? ""),
        asistentes,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      toast.exito("Reunión y acta registradas.");
      setSeleccionados(new Set());
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <Boton type="button" onClick={() => setAbierto(true)}>
        + Registrar reunión
      </Boton>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-4 rounded-2xl border border-borde bg-superficie p-5 shadow-suave">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Nueva reunión · {cursoNombre}</h2>
          <p className="mt-1 text-sm text-tinta-tenue">Registra horario, propósito, asistencia y acuerdos en una sola acta.</p>
        </div>
        <button type="button" onClick={() => setAbierto(false)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-tinta-suave hover:bg-superficie-2">
          Cerrar
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-peligro-suave px-3 py-2 text-sm text-peligro">{error}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">Fecha
          <input name="fecha" type="date" required defaultValue={hoy} className={campo} />
        </label>
        <label className="text-sm font-medium">Hora de inicio
          <input name="horaInicio" type="time" required defaultValue="18:00" className={campo} />
        </label>
        <label className="text-sm font-medium">Hora de término
          <input name="horaFin" type="time" required defaultValue="19:00" className={campo} />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium">Tema principal
        <input name="tema" required maxLength={300} className={campo} placeholder="Ej: organización del semestre y acuerdos de curso" />
      </label>
      <label className="mt-4 block text-sm font-medium">Objetivo
        <textarea name="objetivo" rows={2} maxLength={2000} className={campo} placeholder="Qué se busca informar, conversar o acordar" />
      </label>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Asistencia de apoderados</legend>
        <p className="mt-1 text-xs text-tinta-tenue">Marca solo a quienes participaron. Los nombres provienen de los contactos vinculados a la matrícula.</p>
        {contactos.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-borde p-4 text-sm text-tinta-tenue">Este curso todavía no tiene apoderados vinculados.</p>
        ) : (
          <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
            {contactos.map((contacto) => {
              const activo = seleccionados.has(contacto.id);
              return (
                <label key={contacto.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${activo ? "border-marca-400 bg-marca-50" : "border-borde"}`}>
                  <input type="checkbox" checked={activo} onChange={() => alternar(contacto.id)} className="h-4 w-4 accent-marca-600" />
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium">{contacto.nombre}</span>
                    <span className="block truncate text-xs text-tinta-tenue">
                      {contacto.estudiante} · {contacto.calidad === "TITULAR" ? "Titular" : contacto.calidad === "SUPLENTE" ? "Suplente" : "Por confirmar"} ({contacto.parentesco})
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Acuerdos y responsables
          <textarea name="acuerdos" rows={4} maxLength={5000} className={campo} placeholder="Acuerdo · responsable · plazo" />
        </label>
        <label className="text-sm font-medium">Observaciones internas
          <textarea name="observaciones" rows={4} maxLength={5000} className={campo} placeholder="Información operativa; evita datos sensibles o de terceros" />
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <Boton type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar acta"}</Boton>
      </div>
    </form>
  );
}
