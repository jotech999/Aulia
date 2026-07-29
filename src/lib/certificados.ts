/**
 * Dominio de certificados (documentos oficiales — Circular N°30, Ley 21.719).
 *
 * Lógica pura y testeable: autorización por tipo y rol, enmascaramiento de RUT
 * para la verificación pública (minimización), formato de folio y forma del
 * snapshot. La generación de token/hash y el PDF viven en módulos server.
 */

import { z } from "zod";

export const TIPOS_CERTIFICADO = [
  "ALUMNO_REGULAR",
  "NOTAS_PARCIALES",
  "INFORME_SEMESTRAL",
  "INFORME_ANUAL",
] as const;
export type TipoCertificado = (typeof TIPOS_CERTIFICADO)[number];

/** Tipos que son un boletín/informe de calificaciones (con notas + asistencia). */
export const TIPOS_INFORME: TipoCertificado[] = [
  "NOTAS_PARCIALES",
  "INFORME_SEMESTRAL",
  "INFORME_ANUAL",
];
export const esInforme = (t: TipoCertificado) => TIPOS_INFORME.includes(t);

/** Validación de la entrada de emisión (borde de la server action). */
export const emitirCertificadoSchema = z.object({
  estudianteId: z.string().min(1),
  tipo: z.enum(TIPOS_CERTIFICADO),
  periodo: z.number().int().min(1).max(3).optional(),
  // Concepto/observación del profesor jefe para el boletín (opcional).
  concepto: z.string().trim().max(600).optional().or(z.literal("")),
});

/** Validación de la anulación. */
export const anularCertificadoSchema = z.object({
  certificadoId: z.string().min(1),
  motivo: z.string().trim().min(5, "Indica el motivo").max(500),
});

export const NOMBRE_TIPO: Record<TipoCertificado, string> = {
  ALUMNO_REGULAR: "Certificado de alumno(a) regular",
  NOTAS_PARCIALES: "Informe de notas parciales",
  INFORME_SEMESTRAL: "Informe de calificaciones semestral",
  INFORME_ANUAL: "Informe de calificaciones anual",
};

/** Leyenda de un informe semestral/anual (calificaciones del periodo). */
export const LEYENDA_INFORME_SEMESTRAL =
  "Informe de calificaciones del semestre a la fecha de emisión. La situación final de promoción se establece en el acta de fin de año (Decreto 67).";
export const LEYENDA_INFORME_ANUAL =
  "Informe de calificaciones anual. El promedio final por asignatura corresponde al promedio de los semestres cursados.";

/** Vigencia por defecto del certificado de alumno regular (días). */
export const VIGENCIA_ALUMNO_REGULAR_DIAS = 30;

/** Leyenda obligatoria del informe de notas: deja claro que no son finales. */
export const LEYENDA_NOTAS_PARCIALES =
  "Calificaciones parciales a la fecha de emisión. No constituyen promedios finales ni acta de promoción.";

/**
 * ¿Puede este usuario emitir un certificado de este tipo?
 * - ALUMNO_REGULAR: dirección/administración del establecimiento.
 * - NOTAS_PARCIALES: dirección/UTP, o el profesor jefe de SU curso.
 * La pertenencia al colegio (multi-tenant) se verifica antes, en la query.
 */
export function autorizarEmision(
  tipo: TipoCertificado,
  rol: string,
  usuarioId: string,
  curso: { profesorJefeId: string | null }
): boolean {
  if (rol === "ADMIN" || rol === "DIRECTOR") return true;
  if (tipo === "ALUMNO_REGULAR") {
    // Documento administrativo del establecimiento.
    return rol === "UTP" || rol === "INSPECTOR";
  }
  // Informes de notas (parcial / semestral / anual): UTP o el profesor jefe del curso.
  if (rol === "UTP") return true;
  if (rol === "PROFESOR_JEFE") return curso.profesorJefeId === usuarioId;
  return false;
}

export function puedeAnular(rol: string): boolean {
  return rol === "ADMIN" || rol === "DIRECTOR";
}

/**
 * Enmascara un RUT normalizado ("12345678-9") para la verificación pública:
 * deja visible solo el último dígito del cuerpo y el DV. Ej: "*******8-9".
 * Minimización (Ley 21.719): la página pública no expone el RUT completo.
 */
export function rutEnmascarado(rut: string): string {
  const m = rut.match(/^(\d+)-([\dkK])$/);
  if (!m) return "***";
  const cuerpo = m[1];
  const dv = m[2];
  if (cuerpo.length <= 2) return `***-${dv}`;
  const visibleFinal = cuerpo.slice(-1); // último dígito del cuerpo
  const oculto = "*".repeat(Math.max(cuerpo.length - 1, 1));
  return `${oculto}${visibleFinal}-${dv}`;
}

/** Muestra solo el nombre de pila y la inicial del apellido en la verificación pública. */
export function nombreParcial(nombres: string, apellidos: string): string {
  const primerNombre = nombres.trim().split(/\s+/)[0] ?? "";
  const inicialApellido = apellidos.trim().charAt(0).toUpperCase();
  return `${primerNombre} ${inicialApellido}.`.trim();
}

/** Folio legible: "N°000123". */
export function formatearFolio(folio: number): string {
  return `N°${String(folio).padStart(6, "0")}`;
}

// ── Snapshot inmutable de lo certificado (forma del campo `datos` Json) ──

export type SnapshotColegio = {
  nombre: string;
  rbd: string | null;
  direccion: string | null;
  comuna: string | null;
};

export type SnapshotEstudiante = {
  nombres: string;
  apellidos: string;
  rut: string; // normalizado
};

export type AsignaturaNotas = {
  asignatura: string;
  evaluaciones: { nombre: string; nota: number | null; eximida: boolean }[];
  promedio: number | null;
  // Informe anual: promedios por semestre (el `promedio` es el final anual).
  promedioS1?: number | null;
  promedioS2?: number | null;
};

export type SnapshotCertificado = {
  colegio: SnapshotColegio;
  estudiante: SnapshotEstudiante;
  curso: string | null; // "5B A"
  anio: number;
  emisor: { nombre: string; cargo: string };
  emitidoEnISO: string; // YYYY-MM-DD (Santiago)
  // ALUMNO_REGULAR:
  vigenciaHastaISO?: string;
  // Informes de notas:
  periodo?: number;
  asignaturas?: AsignaturaNotas[];
  leyenda?: string;
  // Boletín semestral / anual:
  asistenciaPct?: number | null; // 0–100
  asistenciaDias?: number; // días con registro
  promedioGeneral?: number | null;
  concepto?: string; // concepto / observación del profesor jefe (opcional)
  anual?: boolean;
};
