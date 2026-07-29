"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { confirmar } from "@/components/ui/confirmar";
import { toast } from "@/components/ui/toast";
import { colorAsignatura } from "@/lib/colores-asignatura";
import {
  actualizarBloqueHorario,
  crearBloqueHorario,
  eliminarBloqueHorario,
} from "./actions";

export type AsignaturaHorario = {
  id: string;
  nombre: string;
  color: string | null;
};

export type BloqueHorarioEditor = {
  id: string;
  asignaturaId: string;
  asignatura: string;
  color: string | null;
  dia: number;
  horaInicio: string;
  horaFin: string;
};

type Formulario = {
  bloqueId: string | null;
  asignaturaId: string;
  dia: number;
  horaInicio: string;
  horaFin: string;
};

type Franja = { horaInicio: string; horaFin: string };

const DIAS = [
  { valor: 1, nombre: "Lunes" },
  { valor: 2, nombre: "Martes" },
  { valor: 3, nombre: "Miércoles" },
  { valor: 4, nombre: "Jueves" },
  { valor: 5, nombre: "Viernes" },
] as const;

const FRANJAS_INICIALES: Franja[] = [
  { horaInicio: "08:00", horaFin: "08:45" },
  { horaInicio: "09:00", horaFin: "09:45" },
  { horaInicio: "10:00", horaFin: "10:45" },
  { horaInicio: "11:00", horaFin: "11:45" },
  { horaInicio: "12:00", horaFin: "12:45" },
  { horaInicio: "14:00", horaFin: "14:45" },
];

const campo =
  "mt-1 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100 disabled:opacity-60";

function desdeRespuesta(bloque: {
  id: string;
  asignaturaId: string;
  dia: number;
  horaInicio: string;
  horaFin: string;
  asignatura: { nombre: string; color: string | null };
}): BloqueHorarioEditor {
  return {
    id: bloque.id,
    asignaturaId: bloque.asignaturaId,
    asignatura: bloque.asignatura.nombre,
    color: bloque.asignatura.color,
    dia: bloque.dia,
    horaInicio: bloque.horaInicio,
    horaFin: bloque.horaFin,
  };
}

export function EditorHorario({
  cursoNombre,
  horarioVersionId,
  asignaturas,
  bloquesIniciales,
}: {
  cursoNombre: string;
  horarioVersionId: string;
  asignaturas: AsignaturaHorario[];
  bloquesIniciales: BloqueHorarioEditor[];
}) {
  const router = useRouter();
  const [bloques, setBloques] = useState(bloquesIniciales);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const franjas = useMemo(() => {
    if (bloques.length === 0) return FRANJAS_INICIALES;
    const unicas = new Map<string, Franja>();
    for (const bloque of bloques) {
      unicas.set(`${bloque.horaInicio}-${bloque.horaFin}`, {
        horaInicio: bloque.horaInicio,
        horaFin: bloque.horaFin,
      });
    }
    return [...unicas.values()].sort((a, b) =>
      a.horaInicio.localeCompare(b.horaInicio)
    );
  }, [bloques]);

  const nuevaBase = (dia = 1, franja = franjas[0] ?? FRANJAS_INICIALES[0]) => ({
    bloqueId: null,
    asignaturaId: asignaturas[0]?.id ?? "",
    dia,
    horaInicio: franja.horaInicio,
    horaFin: franja.horaFin,
  });

  function abrirNuevo(dia?: number, franja?: Franja) {
    setFormulario(nuevaBase(dia, franja));
  }

  function abrirEdicion(bloque: BloqueHorarioEditor) {
    setFormulario({
      bloqueId: bloque.id,
      asignaturaId: bloque.asignaturaId,
      dia: bloque.dia,
      horaInicio: bloque.horaInicio,
      horaFin: bloque.horaFin,
    });
  }

  function guardarFormulario(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!formulario || pendiente) return;
    const datos = {
      asignaturaId: formulario.asignaturaId,
      dia: formulario.dia,
      horaInicio: formulario.horaInicio,
      horaFin: formulario.horaFin,
      horarioVersionId,
    };

    startTransition(async () => {
      const resultado = formulario.bloqueId
        ? await actualizarBloqueHorario({
            ...datos,
            bloqueId: formulario.bloqueId,
          })
        : await crearBloqueHorario(datos);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      const guardado = desdeRespuesta(resultado.bloque);
      setBloques((actuales) => {
        const existe = actuales.some((b) => b.id === guardado.id);
        return existe
          ? actuales.map((b) => (b.id === guardado.id ? guardado : b))
          : [...actuales, guardado];
      });
      setFormulario(null);
      toast.exito(formulario.bloqueId ? "Bloque actualizado." : "Bloque agregado.");
      router.refresh();
    });
  }

  function revertirMovimiento(
    bloqueActual: BloqueHorarioEditor,
    anterior: BloqueHorarioEditor
  ) {
    setBloques((lista) =>
      lista.map((b) => (b.id === anterior.id ? anterior : b))
    );
    startTransition(async () => {
      const resultado = await actualizarBloqueHorario({
        bloqueId: anterior.id,
        asignaturaId: anterior.asignaturaId,
        dia: anterior.dia,
        horaInicio: anterior.horaInicio,
        horaFin: anterior.horaFin,
      });
      if (!resultado.ok) {
        setBloques((lista) =>
          lista.map((b) => (b.id === bloqueActual.id ? bloqueActual : b))
        );
        toast.error(resultado.error);
        return;
      }
      setBloques((lista) =>
        lista.map((b) =>
          b.id === resultado.bloque.id ? desdeRespuesta(resultado.bloque) : b
        )
      );
      toast.info("Movimiento deshecho.");
      router.refresh();
    });
  }

  function moverBloque(bloqueId: string, dia: number, franja: Franja) {
    const anterior = bloques.find((b) => b.id === bloqueId);
    if (!anterior || pendiente) return;
    if (
      anterior.dia === dia &&
      anterior.horaInicio === franja.horaInicio &&
      anterior.horaFin === franja.horaFin
    ) {
      setArrastrando(null);
      setDestino(null);
      return;
    }

    const optimista = {
      ...anterior,
      dia,
      horaInicio: franja.horaInicio,
      horaFin: franja.horaFin,
    };
    setBloques((lista) =>
      lista.map((b) => (b.id === bloqueId ? optimista : b))
    );
    setArrastrando(null);
    setDestino(null);

    startTransition(async () => {
      const resultado = await actualizarBloqueHorario({
        bloqueId,
        asignaturaId: anterior.asignaturaId,
        dia,
        horaInicio: franja.horaInicio,
        horaFin: franja.horaFin,
      });
      if (!resultado.ok) {
        setBloques((lista) =>
          lista.map((b) => (b.id === anterior.id ? anterior : b))
        );
        toast.error(resultado.error);
        return;
      }

      const guardado = desdeRespuesta(resultado.bloque);
      setBloques((lista) =>
        lista.map((b) => (b.id === guardado.id ? guardado : b))
      );
      toast.exito("Bloque movido.", {
        accion: {
          etiqueta: "Deshacer",
          onClick: () => revertirMovimiento(guardado, anterior),
        },
      });
      router.refresh();
    });
  }

  async function quitarBloque() {
    if (!formulario?.bloqueId || pendiente) return;
    const bloqueId = formulario.bloqueId;
    const aceptar = await confirmar({
      titulo: "¿Quitar este bloque del horario?",
      mensaje:
        "Solo se puede quitar si todavía no tiene clases registradas. La acción quedará auditada.",
      textoConfirmar: "Quitar bloque",
      peligro: true,
    });
    if (!aceptar) return;

    startTransition(async () => {
      const resultado = await eliminarBloqueHorario({ bloqueId });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setBloques((lista) => lista.filter((b) => b.id !== bloqueId));
      setFormulario(null);
      toast.exito("Bloque quitado del horario.");
      router.refresh();
    });
  }

  const bloqueEn = (dia: number, franja: Franja) =>
    bloques.find(
      (b) => b.dia === dia && b.horaInicio === franja.horaInicio
    );

  return (
    <div className="space-y-4" aria-busy={pendiente}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-superficie px-4 py-3 shadow-suave">
        <div>
          <p className="font-semibold text-tinta">{cursoNombre}</p>
          <p className="text-xs text-tinta-tenue">
            Arrastra en escritorio o toca un bloque para cambiarlo. Los cambios se validan antes de guardar.
          </p>
        </div>
        <Boton type="button" tamano="sm" onClick={() => abrirNuevo()} disabled={pendiente}>
          + Agregar bloque
        </Boton>
      </div>

      {bloques.length === 0 && (
        <div className="rounded-xl border border-dashed border-borde-fuerte bg-superficie px-5 py-8 text-center">
          <p className="font-display text-lg font-semibold text-tinta">
            Crea el primer bloque del curso
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-tinta-suave">
            Elige una celda de la grilla o agrega un bloque indicando asignatura, día y horas.
          </p>
          <Boton type="button" className="mt-4" onClick={() => abrirNuevo()}>
            Agregar primer bloque
          </Boton>
        </div>
      )}

      <div className="hidden overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2">
              <th className="w-24 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
                Hora
              </th>
              {DIAS.map((dia) => (
                <th
                  key={dia.valor}
                  className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-tinta-tenue"
                >
                  {dia.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {franjas.map((franja) => (
              <tr
                key={`${franja.horaInicio}-${franja.horaFin}`}
                className="border-b border-borde last:border-0"
              >
                <th className="px-3 py-2 text-left align-top text-xs font-normal tabular-nums text-tinta-tenue">
                  <span className="block font-semibold text-tinta-suave">
                    {franja.horaInicio}
                  </span>
                  {franja.horaFin}
                </th>
                {DIAS.map((dia) => {
                  const bloque = bloqueEn(dia.valor, franja);
                  const clave = `${dia.valor}-${franja.horaInicio}`;
                  return (
                    <td
                      key={dia.valor}
                      onDragOver={(evento) => evento.preventDefault()}
                      onDragEnter={() => arrastrando && setDestino(clave)}
                      onDragLeave={() => destino === clave && setDestino(null)}
                      onDrop={(evento) => {
                        evento.preventDefault();
                        const bloqueId =
                          arrastrando || evento.dataTransfer.getData("text/plain");
                        if (bloqueId) moverBloque(bloqueId, dia.valor, franja);
                      }}
                      className={`border-l border-borde p-1.5 align-top transition-colors ${
                        destino === clave ? "bg-marca-50 ring-2 ring-inset ring-marca-300" : ""
                      }`}
                    >
                      {bloque ? (
                        <button
                          type="button"
                          draggable={!pendiente}
                          onDragStart={(evento) => {
                            setArrastrando(bloque.id);
                            evento.dataTransfer.effectAllowed = "move";
                            evento.dataTransfer.setData("text/plain", bloque.id);
                          }}
                          onDragEnd={() => {
                            setArrastrando(null);
                            setDestino(null);
                          }}
                          onClick={() => abrirEdicion(bloque)}
                          className={`min-h-14 w-full cursor-grab rounded-lg px-2 py-2 text-left text-xs leading-tight shadow-sm transition-transform hover:-translate-y-0.5 active:cursor-grabbing ${
                            colorAsignatura(bloque.asignatura, bloque.color).suave
                          }`}
                          title={`${bloque.asignatura}. Arrastra para mover o presiona para editar.`}
                        >
                          <span className="block font-semibold">{bloque.asignatura}</span>
                          <span className="mt-0.5 block opacity-75">Editar o mover</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => abrirNuevo(dia.valor, franja)}
                          className="min-h-14 w-full rounded-lg border border-dashed border-transparent text-xs font-medium text-tinta-tenue transition-colors hover:border-borde-fuerte hover:bg-superficie-2 hover:text-tinta-suave focus:border-marca-400"
                          aria-label={`Agregar bloque el ${dia.nombre} de ${franja.horaInicio} a ${franja.horaFin}`}
                        >
                          + Agregar
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {DIAS.map((dia) => {
          const delDia = bloques
            .filter((b) => b.dia === dia.valor)
            .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
          return (
            <section
              key={dia.valor}
              className="rounded-xl border border-borde bg-superficie p-3 shadow-suave"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-display font-semibold text-tinta">{dia.nombre}</h2>
                <button
                  type="button"
                  onClick={() => abrirNuevo(dia.valor)}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-marca-700 hover:bg-marca-50"
                >
                  + Agregar
                </button>
              </div>
              {delDia.length === 0 ? (
                <p className="rounded-lg bg-superficie-2 px-3 py-4 text-sm text-tinta-tenue">
                  Sin bloques este día.
                </p>
              ) : (
                <ul className="space-y-2">
                  {delDia.map((bloque) => (
                    <li key={bloque.id}>
                      <button
                        type="button"
                        onClick={() => abrirEdicion(bloque)}
                        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                          colorAsignatura(bloque.asignatura, bloque.color).suave
                        }`}
                      >
                        <span className="font-semibold">{bloque.asignatura}</span>
                        <span className="shrink-0 text-xs tabular-nums opacity-75">
                          {bloque.horaInicio}–{bloque.horaFin}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {formulario && (
        <form
          onSubmit={guardarFormulario}
          className="rounded-xl border border-marca-200 bg-superficie p-4 shadow-elevada"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-tinta">
                {formulario.bloqueId ? "Editar bloque" : "Agregar bloque"}
              </h2>
              <p className="text-sm text-tinta-suave">
                Los cruces del curso y del docente se validan al guardar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormulario(null)}
              className="min-h-11 rounded-lg px-3 text-sm font-medium text-tinta-tenue hover:bg-superficie-2"
              aria-label="Cerrar editor"
            >
              Cerrar
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-tinta-suave sm:col-span-2">
              Asignatura
              <select
                value={formulario.asignaturaId}
                onChange={(evento) =>
                  setFormulario({
                    ...formulario,
                    asignaturaId: evento.target.value,
                  })
                }
                className={campo}
                disabled={pendiente}
                required
              >
                {asignaturas.map((asignatura) => (
                  <option key={asignatura.id} value={asignatura.id}>
                    {asignatura.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-tinta-suave">
              Día
              <select
                value={formulario.dia}
                onChange={(evento) =>
                  setFormulario({ ...formulario, dia: Number(evento.target.value) })
                }
                className={campo}
                disabled={pendiente}
              >
                {DIAS.map((dia) => (
                  <option key={dia.valor} value={dia.valor}>
                    {dia.nombre}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-medium text-tinta-suave">
                Inicio
                <input
                  type="time"
                  value={formulario.horaInicio}
                  onChange={(evento) =>
                    setFormulario({
                      ...formulario,
                      horaInicio: evento.target.value,
                    })
                  }
                  className={campo}
                  disabled={pendiente}
                  required
                />
              </label>
              <label className="text-sm font-medium text-tinta-suave">
                Término
                <input
                  type="time"
                  value={formulario.horaFin}
                  onChange={(evento) =>
                    setFormulario({ ...formulario, horaFin: evento.target.value })
                  }
                  className={campo}
                  disabled={pendiente}
                  required
                />
              </label>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {formulario.bloqueId && (
              <Boton
                type="button"
                variante="peligro"
                onClick={quitarBloque}
                disabled={pendiente}
                className="mr-auto"
              >
                Quitar bloque
              </Boton>
            )}
            <Boton
              type="button"
              variante="fantasma"
              onClick={() => setFormulario(null)}
              disabled={pendiente}
            >
              Cancelar
            </Boton>
            <Boton type="submit" disabled={pendiente || asignaturas.length === 0}>
              {pendiente ? "Guardando…" : "Guardar bloque"}
            </Boton>
          </div>
        </form>
      )}

      <p className="sr-only" aria-live="polite">
        {pendiente
          ? "Guardando cambios del horario."
          : arrastrando && destino
            ? `Destino ${destino}.`
            : ""}
      </p>
    </div>
  );
}
