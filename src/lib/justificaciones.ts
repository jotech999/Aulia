export const ESTADOS_JUSTIFICACION = [
  "PENDIENTE",
  "APROBADA",
  "RECHAZADA",
  "ANULADA",
] as const;

export const MOTIVOS_JUSTIFICACION = ["Salud", "Trámite", "Familiar", "Otro"] as const;

export type EstadoJustificacionVista = (typeof ESTADOS_JUSTIFICACION)[number];

export const ROLES_REVISION_JUSTIFICACIONES = ["ADMIN", "DIRECTOR", "INSPECTOR"] as const;

export function puedeRevisarJustificaciones(rol: string): boolean {
  return ROLES_REVISION_JUSTIFICACIONES.some((permitido) => permitido === rol);
}

export function esEstadoJustificacion(valor: string | undefined): valor is EstadoJustificacionVista {
  return ESTADOS_JUSTIFICACION.some((estado) => estado === valor);
}

export const PRESENTACION_ESTADO_JUSTIFICACION: Record<
  EstadoJustificacionVista,
  { etiqueta: string; tono: "neutra" | "exito" | "alerta" | "peligro"; descripcion: string }
> = {
  PENDIENTE: {
    etiqueta: "Pendiente",
    tono: "alerta",
    descripcion: "Inspectoría aún debe revisar los antecedentes.",
  },
  APROBADA: {
    etiqueta: "Aprobada",
    tono: "exito",
    descripcion: "Inspectoría aceptó la justificación.",
  },
  RECHAZADA: {
    etiqueta: "Rechazada",
    tono: "peligro",
    descripcion: "Inspectoría rechazó la justificación.",
  },
  ANULADA: {
    etiqueta: "Anulada",
    tono: "neutra",
    descripcion: "La justificación fue anulada y se conserva en el historial.",
  },
};
