"use client";

import { useEffect } from "react";

/**
 * Migración de claves locales del cambio de marca (Ciudi → Aulia), julio 2026.
 *
 * Por qué existe: el prefijo `ciudi:` no era solo cosmético. Bajo él vive la
 * **cola de asistencia sin conexión** (`ciudi:asistencia:cola:*`), que puede
 * contener registros del libro de clases todavía no sincronizados con el
 * servidor, además de borradores de planificación y de comunicados.
 * Renombrar el prefijo sin migrar habría dejado esos datos huérfanos en el
 * navegador: invisibles para la aplicación y perdidos en el primer cierre de
 * sesión, que barre por prefijo.
 *
 * Se ejecuta una sola vez por navegador y es idempotente: si la clave nueva ya
 * existe, se conserva la nueva y se descarta la antigua (la nueva es siempre
 * más reciente, porque solo pudo escribirla la versión ya renombrada).
 *
 * Se puede borrar este componente cuando ya no queden navegadores con datos
 * anteriores a la migración — en la práctica, un año escolar.
 */

const MARCA_HECHA = "aulia:migracion-marca";
const PREFIJO_ANTIGUO = "ciudi:";
const PREFIJO_NUEVO = "aulia:";

const CLAVES_SUELTAS: readonly [string, string][] = [
  ["ciudi-instalar-descartado", "aulia-instalar-descartado"],
];

function migrarAlmacen(almacen: Storage) {
  const pendientes: string[] = [];
  for (let i = 0; i < almacen.length; i += 1) {
    const clave = almacen.key(i);
    if (clave?.startsWith(PREFIJO_ANTIGUO)) pendientes.push(clave);
  }

  for (const clave of pendientes) {
    const valor = almacen.getItem(clave);
    if (valor === null) continue;
    const nueva = PREFIJO_NUEVO + clave.slice(PREFIJO_ANTIGUO.length);
    if (almacen.getItem(nueva) === null) almacen.setItem(nueva, valor);
    almacen.removeItem(clave);
  }

  for (const [antigua, nueva] of CLAVES_SUELTAS) {
    const valor = almacen.getItem(antigua);
    if (valor === null) continue;
    if (almacen.getItem(nueva) === null) almacen.setItem(nueva, valor);
    almacen.removeItem(antigua);
  }
}

export function MigracionClavesLocales() {
  useEffect(() => {
    try {
      if (localStorage.getItem(MARCA_HECHA) === "1") return;
      migrarAlmacen(localStorage);
      migrarAlmacen(sessionStorage);
      localStorage.setItem(MARCA_HECHA, "1");
    } catch {
      // Almacenamiento bloqueado (modo privado, cookies de terceros). Sin
      // migración no se pierde nada: los datos antiguos siguen donde estaban.
    }
  }, []);

  return null;
}
