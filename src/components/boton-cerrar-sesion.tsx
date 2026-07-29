"use client";

import type { MouseEvent } from "react";
import { confirmar } from "@/components/ui/confirmar";

type Props = {
  compacto?: boolean;
};

const PREFIJO = "aulia:";
/**
 * Prefijo anterior al cambio de marca (Ciudi → Aulia, julio 2026). Se sigue
 * barriendo para no dejar residuos en navegadores que nunca alcanzaron a correr
 * `MigracionClavesLocales`.
 */
const PREFIJO_LEGADO = "ciudi:";

function hayAsistenciaPendienteLocal() {
  try {
    return Object.keys(localStorage).some(
      (clave) =>
        (clave.startsWith(`${PREFIJO}asistencia:cola:`) ||
          clave.startsWith(`${PREFIJO_LEGADO}asistencia:cola:`)) &&
        localStorage.getItem(clave) !== "[]"
    );
  } catch {
    return false;
  }
}

function limpiarDatosLocalesAulia() {
  for (const almacenamiento of [localStorage, sessionStorage]) {
    for (let i = almacenamiento.length - 1; i >= 0; i -= 1) {
      const clave = almacenamiento.key(i);
      if (clave?.startsWith(PREFIJO) || clave?.startsWith(PREFIJO_LEGADO)) {
        almacenamiento.removeItem(clave);
      }
    }
  }
}

/**
 * Cerrar sesión borra todo lo que quedó en el dispositivo. Eso es deliberado:
 * en un colegio el computador de sala es compartido.
 *
 * El problema es que entre esos datos está la cola de asistencia sin conexión,
 * que puede contener registros del libro de clases que todavía no llegan al
 * servidor. Cambiar de perfil ya bloqueaba cuando había cola pendiente
 * (ver `SelectorContexto`); cerrar sesión, en cambio, los borraba en silencio.
 * Aquí se cierra esa asimetría: se avisa y se exige confirmación explícita.
 */
async function alCerrarSesion(evento: MouseEvent<HTMLButtonElement>) {
  if (!hayAsistenciaPendienteLocal()) {
    limpiarDatosLocalesAulia();
    return;
  }

  // Tanto `preventDefault` como la lectura del formulario tienen que ocurrir
  // antes del primer `await`: después, el envío del formulario ya se habría
  // disparado.
  evento.preventDefault();
  const formulario = evento.currentTarget.form;

  const continuar = await confirmar({
    titulo: "Hay asistencia sin sincronizar",
    mensaje:
      "Este dispositivo tiene asistencia tomada que aún no llega al servidor. Si cierras sesión ahora esos registros se pierden y hay que volver a pasar la lista. Conéctate y espera a que termine de sincronizar antes de salir.",
    textoConfirmar: "Salir y descartar la asistencia",
    textoCancelar: "Volver",
    peligro: true,
  });
  if (!continuar) return;

  limpiarDatosLocalesAulia();
  formulario?.requestSubmit();
}

export function BotonCerrarSesion({ compacto = false }: Props) {
  if (compacto) {
    return (
      <button
        type="submit"
        onClick={alCerrarSesion}
        className="text-xs font-medium text-tinta-suave hover:text-tinta"
      >
        Salir
      </button>
    );
  }

  return (
    <button
      type="submit"
      onClick={alCerrarSesion}
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-tinta-tenue transition-colors hover:bg-superficie-3 hover:text-peligro"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
        <path d="M15 17l5-5-5-5" />
        <path d="M20 12H9" />
        <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      </svg>
    </button>
  );
}
