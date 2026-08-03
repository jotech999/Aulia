import type { EstadoAsistencia } from "@/lib/asistencia";

/**
 * COLA DE ASISTENCIA SIN CONEXIÓN — módulo puro y compartido.
 *
 * La lista marcada sin internet se guarda en `localStorage` y se reenvía sola.
 * Este archivo concentra el formato de la clave y la lectura/escritura de la
 * cola para que la página de asistencia y el vigilante global (que corre en
 * TODA la plataforma) no puedan interpretarla de dos maneras distintas.
 *
 * Decisión importante: un lote NUNCA se borra solo por vencer.
 *
 * Antes, un lote de más de 12 horas se descartaba en silencio. Eso significaba
 * que una profesora que marcó la lista en una sala sin señal y no volvió a esa
 * página perdía la asistencia sin enterarse — y la asistencia es un registro
 * legal (Circular 30), no un borrador. Ahora el lote vencido se conserva y se
 * muestra para que la persona decida: reintentar o descartar a conciencia.
 * El vencimiento sigue existiendo, pero solo como AVISO: pasadas esas horas la
 * versión de referencia puede estar desactualizada y conviene revisar la página
 * antes de enviar.
 */

export const PREFIJO_COLA = "aulia:asistencia:cola:";

/** Horas tras las cuales el lote se marca como "conviene revisarlo". */
export const HORAS_VIGENCIA = 12;

export type PayloadCola = {
  cursoId: string;
  bloqueHorarioId?: string;
  fecha: string;
  marcas: Array<{ estudianteId: string; estado: EstadoAsistencia }>;
  clientMutationId: string;
  capturadaEn: string;
  versionBase: string;
  versionDiariaBase?: string;
  expiraEn: number;
};

export type LotePendiente = {
  clave: string;
  payload: PayloadCola;
  /** Pasó la ventana de vigencia: se conserva, pero conviene revisarlo. */
  vencido: boolean;
  /** Ruta de la página donde se puede revisar y resolver este lote. */
  href: string;
};

/** Prefijo de todas las colas de una persona en un colegio. */
export function prefijoDe(contextoCola: string): string {
  return `${PREFIJO_COLA}${contextoCola}:`;
}

/**
 * Clave de un lote. No contiene nombres ni RUT: solo identificadores opacos,
 * porque `localStorage` queda en un dispositivo que puede ser compartido.
 */
export function claveDe(
  contextoCola: string,
  cursoId: string,
  bloqueHorarioId: string | undefined,
  fecha: string
): string {
  return `${prefijoDe(contextoCola)}${cursoId}:${bloqueHorarioId ?? "diaria"}:${fecha}`;
}

export function rutaDe(payload: PayloadCola): string {
  const bloque = payload.bloqueHorarioId ? `&bloqueId=${payload.bloqueHorarioId}` : "";
  return `/libro-clases/asistencia?cursoId=${payload.cursoId}&fecha=${payload.fecha}${bloque}`;
}

export function leer(clave: string): PayloadCola | null {
  try {
    const crudo = localStorage.getItem(clave);
    if (!crudo) return null;
    const p = JSON.parse(crudo) as PayloadCola;
    /*
     * Validación mínima: un lote corrupto no debe romper la plataforma entera.
     * Se comprueban TODOS los campos que el resto del código da por hechos —
     * `capturadaEn` se usa para ordenar y `expiraEn` para marcar vencidos: si
     * faltaran, el aviso de listas pendientes reventaría en cada pantalla.
     */
    if (
      !p ||
      typeof p.cursoId !== "string" ||
      typeof p.fecha !== "string" ||
      typeof p.capturadaEn !== "string" ||
      typeof p.versionBase !== "string" ||
      typeof p.expiraEn !== "number" ||
      !Array.isArray(p.marcas)
    ) {
      return null;
    }
    return p;
  } catch {
    return null; // sin almacenamiento (modo privado) o JSON inválido
  }
}

export function escribir(clave: string, payload: PayloadCola): void {
  try {
    localStorage.setItem(clave, JSON.stringify(payload));
  } catch {
    /* sin almacenamiento: la interfaz igual avisa que no se pudo enviar */
  }
}

export function borrar(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    /* sin almacenamiento */
  }
}

/** Todos los lotes pendientes de esta persona, del más antiguo al más nuevo. */
export function listarPendientes(contextoCola: string, ahora = Date.now()): LotePendiente[] {
  const prefijo = prefijoDe(contextoCola);
  const claves: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefijo)) claves.push(k);
    }
  } catch {
    return [];
  }

  const lotes: LotePendiente[] = [];
  for (const clave of claves) {
    const payload = leer(clave);
    if (!payload) {
      // Entrada ilegible: se retira para que no quede un fantasma eterno.
      borrar(clave);
      continue;
    }
    lotes.push({
      clave,
      payload,
      vencido: payload.expiraEn < ahora,
      href: rutaDe(payload),
    });
  }
  return lotes.sort((a, b) => a.payload.capturadaEn.localeCompare(b.payload.capturadaEn));
}

/** Etiqueta legible de un lote, para el aviso ("5°B · 03-08 · 2ª hora"). */
export function descripcionLote(payload: PayloadCola): string {
  const [, mes, dia] = payload.fecha.split("-");
  const cuando = mes && dia ? `${dia}-${mes}` : payload.fecha;
  const tipo = payload.bloqueHorarioId ? "clase" : "diaria";
  return `Lista ${tipo} del ${cuando} · ${payload.marcas.length} estudiantes`;
}
