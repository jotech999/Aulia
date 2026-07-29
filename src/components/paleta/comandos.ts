import type { NombreIcono } from "@/components/ui/iconos";

/**
 * Catálogo de acciones del buscador global. Módulo puro (sin React) para poder
 * testear el filtrado por rol. Toda acción principal debe estar aquí para ser
 * alcanzable en 2 teclas + Enter (principio de navegación del proyecto).
 */
export type Comando = {
  label: string;
  href: string;
  grupo: string;
  icono: NombreIcono;
  /** Sinónimos para encontrar la acción aunque no se use el nombre exacto. */
  claves?: string;
  /** Roles que ven el comando. Si se omite, lo ven todos los roles de staff (no apoderado). */
  roles?: string[];
};

export const STAFF = ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR"];
export const TODOS = [...STAFF, "APODERADO", "PIE", "ESTUDIANTE", "SOSTENEDOR"];

export const COMANDOS: Comando[] = [
  { grupo: "Acciones frecuentes", label: "Tomar asistencia por clase", href: "/libro-clases/asistencia", icono: "asistencia", claves: "lista bloque hora presente ausente pasar diaria", roles: [...STAFF, "PIE"] },
  { grupo: "Acciones frecuentes", label: "Ingresar calificaciones", href: "/libro-clases/calificaciones", icono: "calificaciones", claves: "notas libreta evaluacion promedio subir" },
  { grupo: "Acciones frecuentes", label: "Leccionario — registrar contenidos y firmar", href: "/libro-clases/firma", icono: "firma", claves: "firma leccionario contenido tratado" },
  { grupo: "Acciones frecuentes", label: "Enviar comunicado a apoderados", href: "/comunicacion", icono: "comunicacion", claves: "avisar mensaje familia circular notificar" },
  { grupo: "Acciones frecuentes", label: "Revisar alertas tempranas", href: "/alertas", icono: "alertas", claves: "riesgo repitencia desercion" },
  { grupo: "Comunidad", label: "Ver el calendario escolar", href: "/calendario", icono: "asistencia", claves: "calendario eventos reunion evaluacion efemeride fechas mes", roles: [...STAFF, "APODERADO", "ESTUDIANTE"] },

  { grupo: "Libro de clases", label: "Libro de clases", href: "/libro-clases", icono: "libro", claves: "registro circular 30" },
  { grupo: "Libro de clases", label: "Ver mi horario semanal", href: "/libro-clases/horario", icono: "asistencia", claves: "horario semana bloques clases grilla calendario" },
  { grupo: "Libro de clases", label: "Asistencia mensual del curso", href: "/libro-clases/asistencia/mensual", icono: "asistencia", claves: "resumen mes porcentaje" },
  { grupo: "Libro de clases", label: "Rúbricas y pautas", href: "/libro-clases/rubricas", icono: "calificaciones", claves: "instrumento pauta criterios feedback", roles: ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR"] },

  { grupo: "Planificación", label: "Revisar planificaciones", href: "/planificacion", icono: "planificacion", claves: "planificar unidad oa objetivos" },
  { grupo: "Planificación", label: "Cobertura curricular (avance de OA)", href: "/planificacion/cobertura", icono: "cobertura", claves: "avance cumplimiento eje" },

  { grupo: "Comunidad", label: "Registrar entrevista o reunión de apoderado", href: "/convivencia/entrevistas/nueva", icono: "convivencia", claves: "reunion apoderado entrevista acuerdos compromisos cita" },
  { grupo: "Comunidad", label: "Ver entrevistas de apoderado", href: "/convivencia/entrevistas", icono: "comunicacion", claves: "reuniones apoderado historial lista entrevistas" },
  { grupo: "Comunidad", label: "Registrar reunión de apoderados del curso", href: "/comunidad/reuniones-apoderados", icono: "comunicacion", claves: "reunion curso apoderados acta asistencia acuerdos horario", roles: ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE"] },
  { grupo: "Comunidad", label: "Mensajes con apoderados", href: "/mensajes", icono: "comunicacion", claves: "mensaje directo apoderado conversacion chat bandeja hilo", roles: ["PROFESOR_JEFE", "ADMIN", "DIRECTOR", "UTP"] },
  { grupo: "Comunidad", label: "Convivencia y seguimiento", href: "/convivencia", icono: "convivencia", claves: "caso protocolo derivacion" },

  { grupo: "Administración", label: "Buscar un estudiante", href: "/admin/estudiantes", icono: "estudiantes", claves: "ficha alumno anotacion hoja de vida pie" },
  { grupo: "Administración", label: "Cursos", href: "/admin/cursos", icono: "cursos", claves: "curso jefatura matricula" },
  { grupo: "Administración", label: "Asistencia de hoy (seguimiento)", href: "/admin/asistencia-hoy", icono: "asistencia", claves: "asistencia hoy jornada tomada pendiente seguimiento cursos", roles: ["ADMIN", "DIRECTOR", "UTP"] },
  { grupo: "Administración", label: "Editar horario semanal", href: "/libro-clases/horario?editar=1", icono: "asistencia", claves: "configurar mover bloques grilla clases", roles: ["ADMIN", "DIRECTOR", "UTP"] },
  { grupo: "Administración", label: "Colores de asignaturas", href: "/admin/asignaturas", icono: "cursos", claves: "color asignatura horario leccionario paleta identidad visual", roles: ["ADMIN", "DIRECTOR", "UTP"] },
  { grupo: "Administración", label: "Configuración del colegio", href: "/admin/configuracion", icono: "cursos", claves: "ajustes avisos notificaciones apoderados email", roles: ["ADMIN", "DIRECTOR"] },
  { grupo: "Administración", label: "Revisar justificaciones", href: "/inspector/justificaciones", icono: "asistencia", claves: "inasistencia certificado aprobar rechazar", roles: ["ADMIN", "DIRECTOR", "INSPECTOR"] },
  { grupo: "Administración", label: "Continuar puesta en marcha", href: "/admin/onboarding", icono: "cursos", claves: "onboarding configurar comenzar checklist", roles: ["ADMIN", "DIRECTOR"] },
  { grupo: "Administración", label: "Centro de cumplimiento", href: "/admin/cumplimiento", icono: "escudo", claves: "ede auditoria respaldo privacidad estado", roles: ["ADMIN", "DIRECTOR", "UTP"] },

  { grupo: "Apoyo", label: "Registros PIE (Programa de Integración Escolar)", href: "/pie", icono: "convivencia", claves: "pie apoyo diagnostico integracion diferencial fonoaudiologo psicopedagogo", roles: ["ADMIN", "DIRECTOR", "PIE"] },

  // Visibles para todos (incluido el apoderado)
  { grupo: "Inicio", label: "Ir al inicio", href: "/dashboard", icono: "panel", claves: "inicio panel resumen home", roles: TODOS },
  { grupo: "Cuenta", label: "Privacidad y mis datos", href: "/privacidad", icono: "candado", claves: "acceso corregir portabilidad supresion datos", roles: TODOS },
  { grupo: "Comunidad", label: "Ver comunicados del colegio", href: "/comunicacion", icono: "comunicacion", claves: "mensajes avisos familia", roles: ["APODERADO"] },
  { grupo: "Comunidad", label: "Mensajes con el profesor jefe", href: "/mensajes", icono: "comunicacion", claves: "mensaje directo profesor conversacion chat", roles: ["APODERADO"] },
];

/** Comandos visibles para un rol (mismo alcance que la UI). */
export function comandosPara(rol: string): Comando[] {
  return COMANDOS.filter((c) => (c.roles ? c.roles.includes(rol) : STAFF.includes(rol)));
}

/** Normaliza texto (sin tildes, minúsculas) para búsqueda tolerante. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Filtra comandos de un rol por una consulta de texto. */
export function buscarComandos(rol: string, consulta: string): Comando[] {
  const q = normalizar(consulta.trim());
  const base = comandosPara(rol);
  if (!q) return base;
  return base.filter((c) => {
    const heno = normalizar(`${c.label} ${c.grupo} ${c.claves ?? ""}`);
    return q.split(/\s+/).every((t) => heno.includes(t));
  });
}
