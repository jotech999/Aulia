"use client";

import { useEffect } from "react";

/**
 * LATIDO DEL CLIENTE — mantiene el servicio despierto mientras alguien tiene
 * Aulia abierta.
 *
 * El problema real: en el plan gratuito el servidor se apaga tras ~15 minutos
 * sin peticiones. Una profesora que deja la libreta abierta durante la clase no
 * genera ninguna, así que al volver a tocar la pantalla se encuentra con 50
 * segundos de espera. Este componente manda una petición diminuta cada 10
 * minutos para que eso no ocurra.
 *
 * Cuidados:
 *  - Solo late con la pestaña VISIBLE. Una pestaña olvidada en segundo plano no
 *    debe mantener viva la instancia toda la noche ni gastar horas del plan.
 *  - Late también al volver a la pestaña, que es justo el momento en que el
 *    contenedor puede estar recién dormido: así el arranque ocurre mientras la
 *    persona todavía está leyendo, y no cuando hace clic.
 *  - `keepalive` para que la petición sobreviva a una navegación.
 *  - Si falla, no pasa nada: es un latido, no una funcionalidad.
 */

const CADA_MS = 10 * 60 * 1000; // 10 min < los ~15 min de inactividad de Render

export function Latido() {
  useEffect(() => {
    let ultimo = 0;

    const latir = () => {
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      // Evita ráfagas al alternar de pestaña varias veces seguidas.
      if (ahora - ultimo < 60_000) return;
      ultimo = ahora;
      fetch("/api/salud", { method: "HEAD", cache: "no-store", keepalive: true }).catch(() => {
        /* sin conexión o servidor arrancando: se reintenta en el próximo ciclo */
      });
    };

    const intervalo = setInterval(latir, CADA_MS);
    document.addEventListener("visibilitychange", latir);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", latir);
    };
  }, []);

  return null;
}
