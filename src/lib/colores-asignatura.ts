/**
 * Color por asignatura, al estilo del horario de Lirmi que la profesora valoró
 * ("el rojo siempre es lenguaje en todos los colegios"). Da vida y hace el
 * horario/clases de hoy más práctico de leer de un vistazo. El color no es el
 * único canal: siempre acompaña al nombre de la asignatura en texto.
 *
 * Devuelve clases de Tailwind LITERALES (para que el scanner las incluya):
 *  - `punto`: color sólido para un punto/acento.
 *  - `suave`: fondo tenue + texto, para una pastilla.
 *
 * El color puede configurarse por asignatura (campo `Asignatura.color`, una
 * CLAVE de esta paleta). Si no hay clave configurada, se cae en la convención
 * chilena por nombre. Se guarda una clave —no clases sueltas— para que el
 * scanner de Tailwind detecte todas las clases posibles y para poder cambiar la
 * paleta sin migrar datos.
 */
export type ColorAsignatura = { punto: string; suave: string };

/** Paleta fija seleccionable por el colegio. La clave es lo que se persiste. */
export const PALETA: Record<string, { etiqueta: string; color: ColorAsignatura }> = {
  rojo: { etiqueta: "Rojo", color: { punto: "bg-red-500", suave: "bg-red-50 text-red-700" } },
  naranja: { etiqueta: "Naranja", color: { punto: "bg-orange-500", suave: "bg-orange-50 text-orange-700" } },
  ambar: { etiqueta: "Ámbar", color: { punto: "bg-amber-500", suave: "bg-amber-50 text-amber-700" } },
  esmeralda: { etiqueta: "Esmeralda", color: { punto: "bg-emerald-500", suave: "bg-emerald-50 text-emerald-700" } },
  teal: { etiqueta: "Verde azulado", color: { punto: "bg-teal-500", suave: "bg-teal-50 text-teal-700" } },
  cyan: { etiqueta: "Cian", color: { punto: "bg-cyan-500", suave: "bg-cyan-50 text-cyan-700" } },
  azul: { etiqueta: "Azul", color: { punto: "bg-blue-500", suave: "bg-blue-50 text-blue-700" } },
  indigo: { etiqueta: "Índigo", color: { punto: "bg-indigo-500", suave: "bg-indigo-50 text-indigo-700" } },
  violeta: { etiqueta: "Violeta", color: { punto: "bg-violet-500", suave: "bg-violet-50 text-violet-700" } },
  rosa: { etiqueta: "Rosa", color: { punto: "bg-pink-500", suave: "bg-pink-50 text-pink-700" } },
  pizarra: { etiqueta: "Pizarra", color: { punto: "bg-slate-500", suave: "bg-slate-100 text-slate-700" } },
};

/** Claves válidas de la paleta, para validar en el borde (Zod). */
export const CLAVES_COLOR = Object.keys(PALETA) as (keyof typeof PALETA)[];

const REGLAS: { test: (n: string) => boolean; clave: keyof typeof PALETA }[] = [
  { test: (n) => n.includes("lenguaje") || n.includes("lengua"), clave: "rojo" },
  { test: (n) => n.includes("matem"), clave: "azul" },
  { test: (n) => n.includes("ingl") || n.includes("idioma"), clave: "cyan" },
  { test: (n) => n.includes("histor") || n.includes("social") || n.includes("geograf"), clave: "ambar" },
  { test: (n) => n.includes("art") || n.includes("music") || n.includes("músic"), clave: "violeta" },
  { test: (n) => n.includes("ed. fís") || n.includes("física") || n.includes("fisica") || n.includes("deport"), clave: "naranja" },
  { test: (n) => n.includes("cien") || n.includes("biolog") || n.includes("quím") || n.includes("quim"), clave: "esmeralda" },
  { test: (n) => n.includes("tecno") || n.includes("computa"), clave: "pizarra" },
  { test: (n) => n.includes("relig") || n.includes("orient") || n.includes("valor"), clave: "teal" },
];

const POR_DEFECTO: ColorAsignatura = {
  punto: "bg-marca-400",
  suave: "bg-superficie-3 text-tinta-suave",
};

/**
 * Color de una asignatura. Prioridad:
 *  1. `clave` configurada por el colegio (si es válida).
 *  2. Convención chilena por nombre.
 *  3. Color neutro por defecto.
 */
export function colorAsignatura(nombre: string, clave?: string | null): ColorAsignatura {
  if (clave && clave in PALETA) return PALETA[clave].color;
  const n = nombre.toLowerCase();
  const regla = REGLAS.find((r) => r.test(n));
  return regla ? PALETA[regla.clave].color : POR_DEFECTO;
}

/** Clave de color efectiva (configurada o por convención); null si no hay convención. */
export function claveColorAsignatura(nombre: string, clave?: string | null): string | null {
  if (clave && clave in PALETA) return clave;
  const n = nombre.toLowerCase();
  return REGLAS.find((r) => r.test(n))?.clave ?? null;
}
