import { z } from "zod";

/**
 * DIRECTORIO DE PERSONAS del colegio.
 *
 * Reúne en un solo lugar a todo el que tiene cuenta: equipo del colegio y
 * apoderados. Antes no existía ninguna pantalla para verlos ni para dar de alta
 * a un profesor, así que había que reescribir los datos en cada formulario.
 *
 * Reglas de negocio (dominio puro, sin base de datos ni sesión):
 *  - Quién puede administrar personas y qué roles puede otorgar cada quien.
 *  - Validación del alta.
 * La autorización real se re-verifica en el servidor, en cada server action.
 */

/** Roles que se pueden dar de alta desde el directorio. */
export const ROLES_ASIGNABLES = [
  "DIRECTOR",
  "UTP",
  "INSPECTOR",
  "PROFESOR_JEFE",
  "PROFESOR",
  "PIE",
  "APODERADO",
] as const;

export type RolAsignable = (typeof ROLES_ASIGNABLES)[number];

export const NOMBRE_ROL: Record<string, string> = {
  ADMIN: "Administrador",
  DIRECTOR: "Director(a)",
  UTP: "UTP",
  INSPECTOR: "Inspector(a)",
  PROFESOR_JEFE: "Profesor(a) jefe",
  PROFESOR: "Profesor(a)",
  PIE: "Equipo PIE",
  APODERADO: "Apoderado(a)",
  ESTUDIANTE: "Estudiante",
  SOSTENEDOR: "Sostenedor",
};

/** Agrupación para los filtros de la pantalla. */
export const GRUPO_ROL: Record<string, "equipo" | "familia" | "otro"> = {
  ADMIN: "equipo",
  DIRECTOR: "equipo",
  UTP: "equipo",
  INSPECTOR: "equipo",
  PROFESOR_JEFE: "equipo",
  PROFESOR: "equipo",
  PIE: "equipo",
  APODERADO: "familia",
  ESTUDIANTE: "familia",
  SOSTENEDOR: "otro",
};

/** Quién puede ENTRAR al directorio. */
export const ROLES_VER_PERSONAS = new Set([
  "ADMIN",
  "DIRECTOR",
  "UTP",
  "INSPECTOR",
  // Docentes: necesitan los datos de contacto de las familias de SUS cursos
  // para poder comunicarse. Su vista va acotada (ver `alcanceFamilias`).
  "PROFESOR_JEFE",
  "PROFESOR",
]);

/**
 * Quién ve a TODAS las familias del colegio. El resto de los roles con acceso
 * (docentes) solo ve a los apoderados de los estudiantes de sus cursos:
 * minimización de datos (Ley 21.719), el mismo criterio que ya usa el resto de
 * la plataforma. El equipo del colegio sí se ve completo — es la guía de
 * contacto interna.
 */
export const ROLES_VER_TODAS_LAS_FAMILIAS = new Set([
  "ADMIN",
  "DIRECTOR",
  "UTP",
  "INSPECTOR",
]);

/** Roles considerados "familia" para efectos del acotamiento por curso. */
export const ROLES_FAMILIA = new Set(["APODERADO", "ESTUDIANTE"]);

/** Quién puede dar de alta, reactivar o revocar el acceso de una persona. */
export const ROLES_GESTIONAR_PERSONAS = new Set(["ADMIN", "DIRECTOR"]);

/**
 * Roles que cada perfil puede otorgar. Nadie puede crear un ADMIN desde la
 * interfaz (se define al montar el colegio) y solo ADMIN/DIRECTOR administran:
 * un UTP no debería poder nombrar directores.
 */
export function rolesQuePuedeOtorgar(rol: string): RolAsignable[] {
  if (rol === "ADMIN") return [...ROLES_ASIGNABLES];
  if (rol === "DIRECTOR") return ROLES_ASIGNABLES.filter((r) => r !== "DIRECTOR");
  return [];
}

export function puedeOtorgar(rolActor: string, rolDestino: string): boolean {
  return (rolesQuePuedeOtorgar(rolActor) as string[]).includes(rolDestino);
}

export const crearPersonaSchema = z.object({
  rut: z.string().trim().min(1, "Indica el RUT"),
  nombre: z.string().trim().min(2, "Indica el nombre completo").max(120),
  email: z.string().trim().email("Correo inválido").max(160),
  rol: z.enum(ROLES_ASIGNABLES),
  telefono: z.string().trim().max(40).optional().or(z.literal("")),
});

export type CrearPersonaInput = z.infer<typeof crearPersonaSchema>;

export const busquedaPersonasSchema = z.object({
  q: z.string().trim().max(120).optional(),
  rol: z.string().trim().max(30).optional(),
  /** Incluir también a quienes tienen el acceso revocado. */
  inactivos: z.boolean().optional(),
});

/**
 * Normaliza el texto de búsqueda: sin tildes y en minúsculas, para que
 * "Muñoz" encuentre a "munoz" y viceversa (los apellidos chilenos se escriben
 * de las dos formas según de dónde vengan los datos).
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}
