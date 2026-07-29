import { normalizarRut, validarRut } from "@/lib/rut";

/**
 * Motor de importación asistida (migración desde otras plataformas).
 *
 * Funciones PURAS: parseo de CSV robusto + validación por fila. La existencia
 * contra la base de datos se resuelve fuera (server action) y se pasa como
 * conjuntos/mapas, para mantener este módulo testeable y sin efectos.
 *
 * Regla: se valida CADA fila por separado; las filas inválidas se informan y se
 * omiten. Nunca se aborta todo el archivo por una fila mala (validación amistosa).
 */

export type TipoImportacion = "estudiantes" | "cursos";

/** Parsea texto CSV a matriz de celdas. Soporta BOM, `;` o `,`, comillas y CRLF/LF. */
export function parsearCsv(texto: string): string[][] {
  let t = texto.replace(/^﻿/, ""); // quita BOM
  // Detecta separador por la primera línea (prioriza ';', estándar Excel es-CL).
  const primeraLinea = t.slice(0, t.search(/\r?\n/) === -1 ? t.length : t.search(/\r?\n/));
  const sep = primeraLinea.split(";").length >= primeraLinea.split(",").length ? ";" : ",";

  const filas: string[][] = [];
  let campo = "";
  let fila: string[] = [];
  let enComillas = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === sep) {
      fila.push(campo); campo = "";
    } else if (c === "\n") {
      fila.push(campo); filas.push(fila); campo = ""; fila = [];
    } else if (c === "\r") {
      // se maneja con el \n siguiente
    } else {
      campo += c;
    }
  }
  // último campo/fila si el archivo no termina en salto de línea
  if (campo !== "" || fila.length > 0) { fila.push(campo); filas.push(fila); }

  // Elimina filas totalmente vacías.
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

/** Convierte la matriz en registros clave→valor usando la primera fila como encabezado. */
export function filasComoObjetos(matriz: string[][]): { encabezados: string[]; registros: Record<string, string>[] } {
  if (matriz.length === 0) return { encabezados: [], registros: [] };
  const encabezados = matriz[0].map((h) => h.trim().toLowerCase());
  const registros = matriz.slice(1).map((f) => {
    const o: Record<string, string> = {};
    encabezados.forEach((h, i) => (o[h] = (f[i] ?? "").trim()));
    return o;
  });
  return { encabezados, registros };
}

export type FilaValidada<T> = {
  fila: number; // número de fila en el archivo (1 = primera fila de datos)
  datos: T | null; // datos normalizados si es válida, null si no
  errores: string[];
  crudo: Record<string, string>;
};

export type EstudianteImport = {
  rut: string; // normalizado
  nombres: string;
  apellidos: string;
  fechaNacimiento: string | null; // ISO yyyy-mm-dd o null
  cursoClave: string | null; // "5BA" (nivel+letra) si trae curso, para matricular
};

export type CursoImport = { nivel: string; letra: string; clave: string };

// Plantillas descargables: encabezados + una fila de ejemplo por tipo.
export const PLANTILLAS: Record<TipoImportacion, { encabezados: string[]; ejemplo: string[] }> = {
  estudiantes: {
    encabezados: ["rut", "nombres", "apellidos", "fecha_nacimiento", "nivel", "letra"],
    ejemplo: ["12345678-5", "Martina Fernanda", "González Rojas", "2015-03-21", "5B", "A"],
  },
  cursos: {
    encabezados: ["nivel", "letra"],
    ejemplo: ["5B", "A"],
  },
};

const NIVELES = new Set([
  "NT1", "NT2",
  "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B",
  "1M", "2M", "3M", "4M",
]);

function normalizarNivel(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "").replace(/°|º/g, "");
}

/** Valida una fecha yyyy-mm-dd; retorna ISO o null (vacío) o undefined si es inválida. */
function parsearFecha(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  // Rechaza fechas de calendario inválidas que JS normaliza en silencio
  // (p. ej. 2015-02-30 → 2015-03-02): el ISO debe coincidir con la entrada.
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return undefined;
  return s;
}

/**
 * Valida filas de estudiantes.
 * @param rutsExistentes RUTs ya en la BD del colegio (normalizados).
 * @param clavesCurso claves de curso válidas del colegio (p. ej. "5B") → id.
 */
export function validarEstudiantes(
  registros: Record<string, string>[],
  rutsExistentes: Set<string>,
  clavesCurso: Set<string>
): FilaValidada<EstudianteImport>[] {
  const vistosEnArchivo = new Set<string>();
  return registros.map((r, i) => {
    const errores: string[] = [];
    const rutRaw = r["rut"] ?? "";
    const nombres = (r["nombres"] ?? "").trim();
    const apellidos = (r["apellidos"] ?? "").trim();
    const rut = normalizarRut(rutRaw);

    if (!rutRaw.trim()) errores.push("Falta el RUT.");
    else if (!rut || !validarRut(rut)) errores.push("RUT inválido (dígito verificador).");
    if (!nombres) errores.push("Faltan los nombres.");
    if (!apellidos) errores.push("Faltan los apellidos.");

    if (rut) {
      if (vistosEnArchivo.has(rut)) errores.push("RUT duplicado dentro del archivo.");
      else vistosEnArchivo.add(rut);
      if (rutsExistentes.has(rut)) errores.push("El estudiante ya existe en el colegio.");
    }

    const fecha = parsearFecha(r["fecha_nacimiento"] ?? "");
    if (fecha === undefined) errores.push("Fecha de nacimiento inválida (usa aaaa-mm-dd).");

    // Curso opcional (para matricular): nivel + letra en columnas separadas.
    let cursoClave: string | null = null;
    const nivelRaw = (r["nivel"] ?? "").trim();
    const letraRaw = (r["letra"] ?? "").trim().toUpperCase();
    if (nivelRaw || letraRaw) {
      if (!nivelRaw || !letraRaw) {
        errores.push("Para matricular indica nivel Y letra (o deja ambos vacíos).");
      } else {
        cursoClave = `${normalizarNivel(nivelRaw)}${letraRaw}`;
        if (!clavesCurso.has(cursoClave)) errores.push(`Curso "${nivelRaw} ${letraRaw}" no existe en el colegio.`);
      }
    }

    const ok = errores.length === 0;
    return {
      fila: i + 1,
      crudo: r,
      errores,
      datos: ok
        ? { rut: rut!, nombres, apellidos, fechaNacimiento: (fecha as string | null) ?? null, cursoClave }
        : null,
    };
  });
}

/**
 * Valida filas de cursos.
 * @param clavesExistentes claves "nivel+letra" ya presentes en el colegio (año activo).
 */
export function validarCursos(
  registros: Record<string, string>[],
  clavesExistentes: Set<string>
): FilaValidada<CursoImport>[] {
  const vistosEnArchivo = new Set<string>();
  return registros.map((r, i) => {
    const errores: string[] = [];
    const nivel = normalizarNivel(r["nivel"] ?? "");
    const letra = (r["letra"] ?? "").trim().toUpperCase();

    if (!nivel) errores.push("Falta el nivel.");
    else if (!NIVELES.has(nivel)) errores.push(`Nivel "${r["nivel"]}" no válido (NT1, NT2, 1B–8B, 1M–4M).`);
    if (!letra) errores.push("Falta la letra.");
    else if (!/^[A-Z]$/.test(letra)) errores.push("La letra debe ser una sola letra (A, B, C…).");

    const clave = `${nivel}${letra}`;
    if (nivel && letra) {
      if (vistosEnArchivo.has(clave)) errores.push("Curso duplicado dentro del archivo.");
      else vistosEnArchivo.add(clave);
      if (clavesExistentes.has(clave)) errores.push("El curso ya existe en el colegio.");
    }

    const ok = errores.length === 0;
    return { fila: i + 1, crudo: r, errores, datos: ok ? { nivel, letra, clave } : null };
  });
}

/** Resumen para la previsualización. */
export function resumen<T>(filas: FilaValidada<T>[]) {
  const validas = filas.filter((f) => f.datos !== null).length;
  return { total: filas.length, validas, invalidas: filas.length - validas };
}
