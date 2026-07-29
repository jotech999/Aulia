/**
 * Dominio de comunicados con familias.
 *
 * Lógica pura: alcance permitido por rol, validación de entrada. La resolución
 * de destinatarios y la verificación de pertenencia (curso/estudiante) viven en
 * la server action (tocan la BD).
 */
import { z } from "zod";

export const ALCANCES = ["COLEGIO", "NIVEL", "CURSO", "ESTUDIANTE", "SELECCION"] as const;
export type Alcance = (typeof ALCANCES)[number];

export const NOMBRE_ALCANCE: Record<Alcance, string> = {
  COLEGIO: "Todo el colegio",
  NIVEL: "Un nivel",
  CURSO: "Un curso",
  ESTUDIANTE: "Un estudiante",
  SELECCION: "Selección de estudiantes",
};

const ROLES_GESTION = new Set(["ADMIN", "DIRECTOR", "UTP"]);
const ROLES_DOCENTES = new Set(["PROFESOR_JEFE", "PROFESOR", "INSPECTOR"]);

/** ¿Puede el usuario crear comunicados? Cualquier staff; el apoderado no. */
export function puedeCrearComunicado(rol: string): boolean {
  return ROLES_GESTION.has(rol) || ROLES_DOCENTES.has(rol);
}

/**
 * Alcances que este rol puede emitir. Gestión (Admin/Director/UTP) llega a todo
 * el colegio; los docentes/inspector solo a CURSO/ESTUDIANTE (y la pertenencia
 * al curso se valida en la server action). El profesor NUNCA emite a colegio/nivel.
 */
export function alcancesPermitidos(rol: string): Alcance[] {
  if (ROLES_GESTION.has(rol)) return [...ALCANCES];
  if (ROLES_DOCENTES.has(rol)) return ["CURSO", "ESTUDIANTE", "SELECCION"];
  return [];
}

export function puedeAlcance(rol: string, alcance: Alcance): boolean {
  return alcancesPermitidos(rol).includes(alcance);
}

/** El reporte de lectura (quién leyó y cuándo) es solo para gestión. */
export function puedeVerReporte(rol: string): boolean {
  return ROLES_GESTION.has(rol) || rol === "INSPECTOR";
}

export const crearComunicadoSchema = z
  .object({
    titulo: z.string().trim().min(3, "Título requerido").max(160),
    cuerpo: z.string().trim().min(5, "Escribe el comunicado").max(5000),
    alcance: z.enum(ALCANCES),
    nivel: z.string().trim().min(1).nullable().optional(),
    cursoId: z.string().min(1).nullable().optional(),
    estudianteId: z.string().min(1).nullable().optional(),
    estudianteIds: z.array(z.string().min(1)).max(100).default([]),
    programadoPara: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
    esPlantilla: z.boolean().default(false),
    nombrePlantilla: z.string().trim().max(80).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // El objetivo correcto debe venir según el alcance.
    const falta = (campo: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Falta ${campo}`, path: [campo] });
    if (!data.esPlantilla && data.alcance === "NIVEL" && !data.nivel) falta("nivel");
    if (!data.esPlantilla && data.alcance === "CURSO" && !data.cursoId) falta("cursoId");
    if (!data.esPlantilla && data.alcance === "ESTUDIANTE" && !data.estudianteId) falta("estudianteId");
    if (!data.esPlantilla && data.alcance === "SELECCION" && data.estudianteIds.length === 0) falta("selección");
    if (data.esPlantilla && !data.nombrePlantilla) falta("nombre de plantilla");
  });

export type CrearComunicadoInput = z.infer<typeof crearComunicadoSchema>;

export function claveBorradorComunicado(contexto: string) {
  return `aulia:comunicado:borrador:${contexto}`;
}
