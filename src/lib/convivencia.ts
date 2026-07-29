/**
 * Dominio de convivencia escolar (casos, entrevistas y seguimientos).
 *
 * Datos sensibles y de debido proceso: el acceso se restringe al equipo de
 * convivencia y, sobre su jefatura, al profesor jefe. Lógica pura: autorización
 * y validación. La pertenencia (estudiante del curso del profesor jefe) se
 * verifica en la server action.
 */
import { z } from "zod";

export const ESTADOS_CASO = ["ABIERTO", "EN_SEGUIMIENTO", "CERRADO"] as const;
export type EstadoCaso = (typeof ESTADOS_CASO)[number];

export const TIPOS_SEGUIMIENTO = [
  "ENTREVISTA",
  "DESCARGOS",
  "LLAMADA",
  "DERIVACION",
  "ACUERDO",
  "MEDIDA",
  "NOTIFICACION_APODERADO",
  "NOTA",
] as const;
export type TipoSeguimiento = (typeof TIPOS_SEGUIMIENTO)[number];

export const NOMBRE_TIPO_SEGUIMIENTO: Record<TipoSeguimiento, string> = {
  ENTREVISTA: "Entrevista",
  DESCARGOS: "Descargos (derecho a ser oído)",
  LLAMADA: "Llamada",
  DERIVACION: "Derivación",
  ACUERDO: "Acuerdo",
  MEDIDA: "Medida formativa/disciplinaria",
  NOTIFICACION_APODERADO: "Notificación al apoderado",
  NOTA: "Nota de seguimiento",
};

export const CATEGORIAS_CASO = [
  "Entrevista",
  "Conflicto entre pares",
  "Maltrato o violencia escolar",
  "Derivación a especialista",
  "Acompañamiento",
  "Otro",
] as const;

/** Equipo de convivencia: ve y gestiona TODOS los casos del colegio. */
const ROLES_EQUIPO = new Set(["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"]);

export function esEquipoConvivencia(rol: string): boolean {
  return ROLES_EQUIPO.has(rol);
}

/**
 * ¿Puede el usuario acceder a convivencia? El equipo (todo el colegio) y el
 * profesor jefe (solo su jefatura, validado en la action). El profesor de
 * asignatura y el apoderado quedan fuera (datos sensibles).
 */
export function puedeConvivencia(rol: string): boolean {
  return ROLES_EQUIPO.has(rol) || rol === "PROFESOR_JEFE";
}

export const crearCasoSchema = z.object({
  estudianteId: z.string().min(1),
  categoria: z.enum(CATEGORIAS_CASO),
  titulo: z.string().trim().max(160).optional().default(""),
  descripcion: z.string().trim().min(5, "Describe el caso").max(4000),
  responsableId: z.string().min(1).nullable().optional(),
});
export type CrearCasoInput = z.infer<typeof crearCasoSchema>;

export const agregarSeguimientoSchema = z.object({
  casoId: z.string().min(1),
  tipo: z.enum(TIPOS_SEGUIMIENTO),
  texto: z.string().trim().min(3, "Describe el seguimiento").max(4000),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
});
export type AgregarSeguimientoInput = z.infer<typeof agregarSeguimientoSchema>;

export const cambiarEstadoSchema = z.object({
  casoId: z.string().min(1),
  estado: z.enum(ESTADOS_CASO),
});
