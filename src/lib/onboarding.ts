import { z } from "zod";

export const PASOS_ONBOARDING = ["DATOS_COLEGIO", "ANIO_ESCOLAR", "CURSOS", "EQUIPO", "ESTUDIANTES", "HORARIO", "FINAL"] as const;
export const pasoOnboardingSchema = z.enum(PASOS_ONBOARDING);

export const PASO_INFO = {
  DATOS_COLEGIO: { titulo: "Datos del colegio", detalle: "Identidad, RBD y canales de contacto", href: "/admin/configuracion" },
  ANIO_ESCOLAR: { titulo: "Año escolar", detalle: "Períodos y fechas de trabajo", href: "/admin/configuracion" },
  CURSOS: { titulo: "Cursos y asignaturas", detalle: "Estructura académica del año", href: "/admin/cursos" },
  EQUIPO: { titulo: "Equipo y permisos", detalle: "Docentes y roles autorizados", href: "/admin/configuracion" },
  ESTUDIANTES: { titulo: "Estudiantes", detalle: "Importación o matrícula activa", href: "/admin/importar" },
  HORARIO: { titulo: "Horario", detalle: "Bloques vigentes por curso", href: "/libro-clases/horario" },
  FINAL: { titulo: "Listo para operar", detalle: "Revisión final y primera asistencia", href: "/libro-clases/asistencia" },
} as const;

export type PasoOnboarding = (typeof PASOS_ONBOARDING)[number];

export function primerPasoPendiente(completados: Record<PasoOnboarding, boolean>): PasoOnboarding {
  return PASOS_ONBOARDING.find((paso) => !completados[paso]) ?? "FINAL";
}
