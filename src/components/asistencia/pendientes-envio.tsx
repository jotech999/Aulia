"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  borrar,
  descripcionLote,
  listarPendientes,
  type LotePendiente,
} from "@/lib/cola-asistencia";
import {
  guardarAsistencia,
  guardarAsistenciaBloque,
} from "@/app/(dashboard)/libro-clases/asistencia/actions";

/**
 * VIGILANTE DE LISTAS SIN ENVIAR — corre en TODA la plataforma.
 *
 * El problema que resuelve: la asistencia marcada sin señal se guardaba en el
 * teléfono y se reenviaba… solo si la persona volvía a esa misma página. Si la
 * profesora marcaba 5°B en una sala sin wifi y seguía con su día, el lote se
 * quedaba ahí y a las 12 horas se descartaba en silencio. La asistencia es un
 * registro legal: perderla sin avisar no es aceptable.
 *
 * Ahora, desde cualquier pantalla:
 *  - se reintenta el envío al recuperar señal, al volver a la pestaña y cada
 *    par de minutos (no solo con el evento "online", que muchos navegadores
 *    disparan aunque la red todavía no funcione de verdad);
 *  - mientras haya algo pendiente se ve un aviso discreto, con el enlace a la
 *    página donde revisarlo;
 *  - nada se descarta solo: si un lote no se puede enviar, se muestra y la
 *    persona decide.
 */

const REINTENTO_MS = 2 * 60 * 1000;

export function PendientesEnvio({ contextoCola }: { contextoCola: string }) {
  const pathname = usePathname();
  const [pendientes, setPendientes] = useState<LotePendiente[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [oculto, setOculto] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  const trabajando = useRef(false);

  /*
   * En la página de asistencia este vigilante NO envía nada. La página lleva su
   * propia versión de referencia en memoria, y si el vigilante guardaba por
   * detrás esa versión quedaba obsoleta: la siguiente marca de la profesora
   * chocaba con un "conflicto" inventado por nosotros. Ahí manda la página; el
   * vigilante se limita a mirar.
   */
  const enLaPaginaDeAsistencia = pathname?.startsWith("/libro-clases/asistencia") ?? false;

  const releer = useCallback(() => {
    setPendientes(listarPendientes(contextoCola));
  }, [contextoCola]);

  const intentarEnviar = useCallback(async () => {
    // Una sola pasada a la vez: dos reintentos simultáneos del mismo lote
    // podrían chocar entre sí y aparecer como conflicto de versión.
    if (trabajando.current || enLaPaginaDeAsistencia) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      releer();
      return;
    }
    trabajando.current = true;
    setEnviando(true);
    let rechazo: string | null = null;
    try {
      for (const lote of listarPendientes(contextoCola)) {
        try {
          const res = lote.payload.bloqueHorarioId
            ? await guardarAsistenciaBloque(lote.payload)
            : await guardarAsistencia(lote.payload);
          // Solo se retira de la cola cuando el servidor confirma. Un conflicto
          // o un error dejan el lote intacto para resolverlo en su página.
          if (res.ok) {
            borrar(lote.clave);
          } else if (!rechazo) {
            /*
             * Hay rechazos PERMANENTES: si entre la captura sin señal y el
             * reintento se matriculó o se retiró a alguien, la nómina ya no
             * calza con el curso y ese lote no se enviará nunca. Callarlo
             * dejaba a la profesora esperando para siempre un envío que no iba
             * a ocurrir, así que el motivo del servidor se muestra tal cual.
             */
            rechazo = res.error;
          }
        } catch {
          // Red todavía inestable: se reintenta en el próximo ciclo.
          break;
        }
      }
    } finally {
      trabajando.current = false;
      setEnviando(false);
      setProblema(rechazo);
      releer();
    }
  }, [contextoCola, releer, enLaPaginaDeAsistencia]);

  useEffect(() => {
    releer();
    void intentarEnviar();

    const alVolver = () => void intentarEnviar();
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") void intentarEnviar();
    };
    // `storage` avisa de lo que ocurre en OTRA pestaña: si allí se envió la
    // lista, este aviso debe desaparecer sin esperar dos minutos.
    const alCambiarAlmacen = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith("aulia:asistencia:cola:")) releer();
    };

    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("storage", alCambiarAlmacen);
    const intervalo = setInterval(() => void intentarEnviar(), REINTENTO_MS);

    return () => {
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("storage", alCambiarAlmacen);
      clearInterval(intervalo);
    };
  }, [intentarEnviar, releer]);

  // En la propia página de asistencia sobra: ahí la barra de guardado ya dice
  // exactamente en qué estado está el registro, y dos avisos a la vez confunden.
  if (pendientes.length === 0 || oculto || enLaPaginaDeAsistencia) return null;

  const hayVencidos = pendientes.some((p) => p.vencido);
  const primero = pendientes[0];

  return (
    <div
      data-noprint
      role="status"
      aria-live="polite"
      /*
       * En el teléfono va ARRIBA, justo bajo la barra superior: abajo ya viven
       * el lanzador de Auli y la barra de guardado, y superponerlos deja al
       * profesor sin poder tocar ninguno. En escritorio va abajo a la izquierda,
       * lejos de Auli (abajo a la derecha).
       */
      className="fixed inset-x-3 top-[3.5rem] z-30 mx-auto max-w-md rounded-xl border border-alerta/30 bg-alerta-suave/95 p-3 text-sm shadow-elevada backdrop-blur md:inset-x-auto md:bottom-5 md:left-5 md:top-auto"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-1 h-2 w-2 shrink-0 rounded-full bg-alerta ${enviando ? "animate-pulse" : ""}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-alerta">
            {pendientes.length === 1
              ? "Hay una lista sin enviar"
              : `Hay ${pendientes.length} listas sin enviar`}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-alerta/90">
            {enviando
              ? "Enviando…"
              : problema
                ? `El colegio rechazó el envío: ${problema} Ábrela para revisarla o descartarla.`
                : hayVencidos
                  ? "Quedaron guardadas en este dispositivo y no se han podido enviar. Ábrelas para revisarlas: no se borrarán solas."
                  : "Están guardadas en este dispositivo y se enviarán solas al recuperar la señal."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={primero.href}
              className="rounded-lg border border-alerta/40 bg-superficie px-2.5 py-1.5 text-xs font-semibold text-alerta transition-colors hover:bg-alerta-suave"
            >
              Revisar {descripcionLote(primero.payload)}
            </Link>
            <button
              type="button"
              onClick={() => void intentarEnviar()}
              disabled={enviando}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-alerta underline disabled:opacity-50"
            >
              Reintentar ahora
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOculto(true)}
          aria-label="Ocultar aviso"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-alerta/70 transition-colors hover:bg-alerta/10"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
