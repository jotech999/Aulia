import { z } from "zod";

export const TIPOS_SOLICITUD = [
  "ACCESO",
  "RECTIFICACION",
  "SUPRESION",
  "OPOSICION",
  "PORTABILIDAD",
  "BLOQUEO",
] as const;

export const solicitudPrivacidadSchema = z.object({
  tipo: z.enum(TIPOS_SOLICITUD),
  descripcion: z.string().trim().min(10, "Explica brevemente tu solicitud.").max(1200),
});

export const ETIQUETA_TIPO: Record<(typeof TIPOS_SOLICITUD)[number], string> = {
  ACCESO: "Acceder a mis datos",
  RECTIFICACION: "Corregir datos",
  SUPRESION: "Solicitar supresión",
  OPOSICION: "Oponerme a un tratamiento",
  PORTABILIDAD: "Solicitar portabilidad",
  BLOQUEO: "Solicitar bloqueo temporal",
};

export function calcularVencimientoInterno(desde = new Date()) {
  return new Date(desde.getTime() + 30 * 24 * 60 * 60 * 1000);
}
