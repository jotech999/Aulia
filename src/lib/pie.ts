import { z } from "zod";

/**
 * PIE (Programa de Integración Escolar) — dato de MÁXIMA sensibilidad.
 * Acceso restringido al equipo PIE y a la dirección. El diagnóstico se cifra
 * (ver lib/cifrado) y toda acción se audita. El apoderado y el resto del staff
 * NO acceden a estos registros.
 */

export const ROLES_PIE = new Set(["ADMIN", "DIRECTOR", "PIE"]);

export function puedePie(rol: string): boolean {
  return ROLES_PIE.has(rol);
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
