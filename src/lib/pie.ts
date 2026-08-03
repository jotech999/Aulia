import { z } from "zod";

/**
 * PIE (Programa de Integración Escolar) — dato de MÁXIMA sensibilidad.
 *
 * Hay DOS niveles de acceso, y la diferencia es deliberada:
 *
 *  - FICHA COMPLETA (diagnóstico cifrado + bitácora de sesiones): equipo PIE y
 *    dirección. El diagnóstico se cifra (ver lib/cifrado) y toda escritura se
 *    audita. El apoderado no accede.
 *  - ADECUACIONES DE AULA (qué hacer en clases): además, los docentes de los
 *    cursos donde está el/la estudiante. Sin diagnóstico y sin sesiones. Ver
 *    `ROLES_APOYOS_AULA` más abajo para el razonamiento completo.
 */

export const ROLES_PIE = new Set(["ADMIN", "DIRECTOR", "PIE"]);

export function puedePie(rol: string): boolean {
  return ROLES_PIE.has(rol);
}

/**
 * QUIÉN VE LAS ADECUACIONES DE AULA (no la ficha completa).
 *
 * El Decreto 83 no se aplica en la oficina del equipo PIE: se aplica en la sala,
 * y quien lo aplica es la persona que hace la clase. Un profesor que no sabe que
 * a un estudiante hay que darle más tiempo, o leerle el enunciado en voz alta,
 * simplemente no puede cumplir el plan — y el colegio queda incumpliendo sin
 * saberlo.
 *
 * Por eso los docentes ven los APOYOS Y ADECUACIONES de los estudiantes de SUS
 * cursos, y nada más:
 *   - NUNCA el diagnóstico (dato de salud, Ley 21.719 art. 2 letra g). Es
 *     información clínica que no cambia lo que el profesor debe hacer en clases:
 *     lo que necesita es la instrucción pedagógica, no la etiqueta médica.
 *   - NUNCA la bitácora de sesiones de apoyo ni el profesional tratante.
 *   - Solo lectura: la ficha se edita únicamente desde el equipo PIE.
 *
 * Esa separación es justamente lo que pide la minimización de datos: el mínimo
 * necesario para la finalidad, que aquí es enseñar bien a ese estudiante.
 */
export const ROLES_APOYOS_AULA = new Set([
  "ADMIN",
  "DIRECTOR",
  "PIE",
  "UTP",
  "PROFESOR_JEFE",
  "PROFESOR",
]);

export function puedeVerApoyosAula(rol: string): boolean {
  return ROLES_APOYOS_AULA.has(rol);
}

export const guardarFichaPieSchema = z.object({
  estudianteId: z.string().min(1).max(40),
  diagnostico: z.string().trim().min(3, "Indica el diagnóstico.").max(5000),
  apoyos: z.string().trim().max(5000).optional().default(""),
  profesionalACargo: z.string().trim().max(200).optional().default(""),
});

export const agregarSesionPieSchema = z.object({
  estudianteId: z.string().min(1).max(40),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  asistio: z.boolean().default(true),
  observacion: z.string().trim().max(3000).optional().default(""),
});

export type GuardarFichaPieInput = z.infer<typeof guardarFichaPieSchema>;
export type AgregarSesionPieInput = z.infer<typeof agregarSesionPieSchema>;
