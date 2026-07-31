"use client";

/**
 * FICHA DE APODERADOS Y SALUD (isla de cliente) — pedido docente:
 * - Apoderado titular y suplente con su RUN, teléfono, dirección y parentesco.
 * - Antecedentes médicos del estudiante (se guardan CIFRADOS, Ley 21.719).
 * La edición queda restringida a dirección/admin; el resto del staff solo ve.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarContactoApoderado, guardarAntecedentesMedicos } from "./contacto-actions";
import { toast } from "@/components/ui/toast";

export type ApoderadoFicha = {
  apoderadoId: string;
  nombre: string;
  rut: string;
  email: string;
  telefono: string | null;
  direccion: string | null;
  parentesco: string;
  calidad: "TITULAR" | "SUPLENTE" | "SIN_CONFIRMAR";
};

const CALIDAD: Record<string, { label: string; cls: string }> = {
  TITULAR: { label: "Titular", cls: "bg-marca-100 text-marca-700" },
  SUPLENTE: { label: "Suplente", cls: "bg-superficie-3 text-tinta-suave" },
  SIN_CONFIRMAR: { label: "Sin confirmar", cls: "bg-alerta-suave text-alerta" },
};

export function ApoderadosSalud({
  estudianteId,
  apoderados,
  antecedentes,
  puedeEditar,
  puedeVerSalud,
}: {
  estudianteId: string;
  apoderados: ApoderadoFicha[];
  antecedentes: string;
  puedeEditar: boolean;
  puedeVerSalud: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [editandoSalud, setEditandoSalud] = useState(false);
  const [salud, setSalud] = useState(antecedentes);
  const [pendiente, startTransition] = useTransition();

  function guardarContacto(a: ApoderadoFicha, form: FormData) {
    startTransition(async () => {
      const r = await guardarContactoApoderado({
        apoderadoId: a.apoderadoId,
        telefono: String(form.get("telefono") ?? ""),
        direccion: String(form.get("direccion") ?? ""),
      });
      if (r.ok) {
        toast.exito("Contacto actualizado.");
        setEditando(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function guardarSalud() {
    startTransition(async () => {
      const r = await guardarAntecedentesMedicos({ estudianteId, texto: salud });
      if (r.ok) {
        toast.exito("Antecedentes guardados (cifrados).");
        setEditandoSalud(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Apoderados y contacto</h2>
      {apoderados.length === 0 ? (
        <p className="superficie mt-3 rounded-xl px-5 py-6 text-sm text-tinta-suave">
          Este estudiante aún no tiene apoderados vinculados.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {apoderados.map((a) => (
            <div key={a.apoderadoId} className="superficie rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-tinta">{a.nombre}</p>
                  <p className="text-xs text-tinta-tenue">
                    {a.parentesco} · RUN {a.rut}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CALIDAD[a.calidad].cls}`}>
                  {CALIDAD[a.calidad].label}
                </span>
              </div>

              {editando === a.apoderadoId ? (
                <form action={(fd) => guardarContacto(a, fd)} className="mt-3 space-y-2 text-sm">
                  <label className="block text-xs font-medium text-tinta-tenue">
                    Teléfono / celular
                    <input
                      name="telefono"
                      defaultValue={a.telefono ?? ""}
                      placeholder="+56 9 1234 5678"
                      maxLength={40}
                      className="mt-0.5 w-full rounded-lg border border-borde px-2.5 py-1.5"
                    />
                  </label>
                  <label className="block text-xs font-medium text-tinta-tenue">
                    Dirección
                    <input
                      name="direccion"
                      defaultValue={a.direccion ?? ""}
                      placeholder="Calle, número, comuna"
                      maxLength={200}
                      className="mt-0.5 w-full rounded-lg border border-borde px-2.5 py-1.5"
                    />
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={pendiente} className="btn btn-primario btn-sm">
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditando(null)} className="text-xs text-tinta-tenue hover:text-tinta">
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-tinta-tenue">Teléfono</dt>
                    <dd className="text-tinta">{a.telefono || <span className="text-tinta-tenue">—</span>}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-tinta-tenue">Dirección</dt>
                    <dd className="text-tinta">{a.direccion || <span className="text-tinta-tenue">—</span>}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-tinta-tenue">Correo</dt>
                    <dd className="break-all text-tinta">{a.email}</dd>
                  </div>
                </dl>
              )}

              {puedeEditar && editando !== a.apoderadoId && (
                <button
                  type="button"
                  onClick={() => setEditando(a.apoderadoId)}
                  className="mt-3 text-xs font-semibold text-marca-600 hover:text-marca-700"
                >
                  Editar contacto →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {puedeVerSalud && (
        <div className="superficie mt-4 rounded-xl border-l-4 border-l-alerta p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-tinta">Antecedentes médicos</h3>
              <p className="text-xs text-tinta-tenue">
                Dato sensible (Ley 21.719): se guarda cifrado y solo lo ve dirección y la jefatura del curso.
              </p>
            </div>
            {puedeEditar && !editandoSalud && (
              <button
                type="button"
                onClick={() => setEditandoSalud(true)}
                className="shrink-0 text-xs font-semibold text-marca-600 hover:text-marca-700"
              >
                {antecedentes ? "Editar" : "Registrar"} →
              </button>
            )}
          </div>
          {editandoSalud ? (
            <div className="mt-3">
              <textarea
                value={salud}
                onChange={(e) => setSalud(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Alergias, medicamentos, condiciones a considerar en el colegio…"
                className="w-full rounded-lg border border-borde px-3 py-2 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={guardarSalud} disabled={pendiente} className="btn btn-primario btn-sm">
                  {pendiente ? "Guardando…" : "Guardar cifrado"}
                </button>
                <button type="button" onClick={() => { setEditandoSalud(false); setSalud(antecedentes); }} className="text-xs text-tinta-tenue hover:text-tinta">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-sm text-tinta">
              {antecedentes || <span className="text-tinta-tenue">Sin antecedentes registrados.</span>}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
