"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Iconos, type NombreIcono } from "@/components/ui/iconos";

type Item = {
  href: string;
  etiqueta: string;
  icono: NombreIcono;
  /** Roles que ven el ítem. Si se omite, lo ve el staff general (no apoderado, no PIE). */
  roles?: string[];
};
type Grupo = { titulo: string; items: Item[] };

// Staff docente/administrativo general (excluye apoderado y el rol PIE, que tienen
// navegación acotada). Dirección/inspectoría/UTP/profesores.
const STAFF_GENERAL = ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR"];
const TODOS = [...STAFF_GENERAL, "APODERADO", "PIE", "ESTUDIANTE"];
const PIE = ["ADMIN", "DIRECTOR", "PIE"];

/**
 * Roles que hacen clases o supervisan lo pedagógico. Es STAFF_GENERAL sin
 * INSPECTOR, y existe porque el ítem sin `roles` cae por defecto en
 * STAFF_GENERAL: eso le mostraba a inspectoría el maletín docente completo
 * (libreta, evaluaciones, leccionario, planificación, cobertura, asistente IA),
 * ocho secciones donde solo encontraba pantallas vacías que además le sugerían
 * que le faltaba una asignación. Un inspector nunca va a tener asignaturas a
 * cargo. Su trabajo es asistencia, atrasos, justificaciones y convivencia.
 */
const DOCENTES = ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR"];

const GRUPOS_BASE: Grupo[] = [
  {
    titulo: "Principal",
    items: [
      { href: "/dashboard", etiqueta: "Inicio", icono: "panel", roles: TODOS },
      { href: "/mi-cuenta", etiqueta: "Mi cuenta", icono: "calificaciones", roles: ["APODERADO"] },
      { href: "/calendario", etiqueta: "Calendario", icono: "asistencia", roles: [...STAFF_GENERAL, "APODERADO", "ESTUDIANTE"] },
      { href: "/alertas", etiqueta: "Alertas", icono: "alertas" },
      { href: "/privacidad", etiqueta: "Privacidad", icono: "candado", roles: [...TODOS, "SOSTENEDOR"] },
    ],
  },
  {
    titulo: "Apoyo",
    items: [
      { href: "/pie", etiqueta: "PIE", icono: "convivencia", roles: PIE },
      { href: "/libro-clases/asistencia", etiqueta: "Asistencia de apoyos", icono: "asistencia", roles: ["PIE"] },
    ],
  },
  {
    titulo: "Red",
    items: [{ href: "/sostenedor", etiqueta: "Inicio de la red", icono: "panel", roles: ["SOSTENEDOR"] }],
  },
  {
    titulo: "Libro de clases",
    items: [
      { href: "/libro-clases", etiqueta: "Libro de clases", icono: "libro", roles: DOCENTES },
      { href: "/libro-clases/horario", etiqueta: "Mi horario", icono: "asistencia", roles: ["PROFESOR", "PROFESOR_JEFE"] },
      { href: "/libro-clases/horario", etiqueta: "Horarios", icono: "asistencia", roles: ["ADMIN", "DIRECTOR", "UTP"] },
      { href: "/libro-clases/asistencia", etiqueta: "Asistencia", icono: "asistencia" },
      { href: "/libro-clases/calificaciones", etiqueta: "Calificaciones", icono: "calificaciones", roles: DOCENTES },
      { href: "/libro-clases/evaluaciones", etiqueta: "Evaluaciones online", icono: "planificacion", roles: DOCENTES },
      { href: "/libro-clases/rubricas", etiqueta: "Rúbricas y pautas", icono: "calificaciones", roles: ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR"] },
      { href: "/libro-clases/firma", etiqueta: "Leccionario", icono: "firma", roles: DOCENTES },
      { href: "/libro-clases/anotaciones", etiqueta: "Anotaciones", icono: "convivencia" },
    ],
  },
  {
    titulo: "Planificación",
    items: [
      { href: "/planificacion", etiqueta: "Planificación", icono: "planificacion", roles: DOCENTES },
      { href: "/planificacion/cobertura", etiqueta: "Cobertura", icono: "cobertura", roles: DOCENTES },
      { href: "/asistente-docente", etiqueta: "Asistente IA", icono: "planificacion", roles: DOCENTES },
    ],
  },
  {
    titulo: "Comunidad",
    items: [
      { href: "/comunicacion", etiqueta: "Comunicación", icono: "comunicacion", roles: [...STAFF_GENERAL, "APODERADO"] },
      { href: "/mensajes", etiqueta: "Mensajes", icono: "comunicacion", roles: ["PROFESOR_JEFE", "ADMIN", "DIRECTOR", "UTP", "APODERADO"] },
      { href: "/convivencia", etiqueta: "Convivencia", icono: "convivencia" },
      { href: "/convivencia/entrevistas", etiqueta: "Entrevistas", icono: "comunicacion" },
      { href: "/comunidad/reuniones-apoderados", etiqueta: "Reuniones de apoderados", icono: "comunicacion", roles: ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE"] },
      { href: "/inspector/justificaciones", etiqueta: "Justificaciones", icono: "asistencia", roles: ["ADMIN", "DIRECTOR", "INSPECTOR"] },
    ],
  },
  {
    titulo: "Administración",
    items: [
      { href: "/admin/cursos", etiqueta: "Cursos", icono: "cursos" },
      { href: "/admin/asignaturas", etiqueta: "Colores de asignaturas", icono: "cursos", roles: ["ADMIN", "DIRECTOR", "UTP"] },
      { href: "/admin/estudiantes", etiqueta: "Estudiantes", icono: "estudiantes" },
      { href: "/admin/admision", etiqueta: "Admisión", icono: "estudiantes", roles: ["ADMIN", "DIRECTOR"] },
      { href: "/admin/matricular", etiqueta: "Matricular estudiante", icono: "estudiantes", roles: ["ADMIN", "DIRECTOR"] },
      { href: "/admin/apoderados", etiqueta: "Apoderados por curso", icono: "convivencia", roles: ["ADMIN", "DIRECTOR", "UTP"] },
      { href: "/admin/importar", etiqueta: "Migración asistida", icono: "estudiantes", roles: ["ADMIN", "DIRECTOR"] },
      { href: "/admin/finanzas", etiqueta: "Finanzas", icono: "calificaciones", roles: ["ADMIN", "DIRECTOR"] },
      { href: "/admin/asistencia-hoy", etiqueta: "Asistencia de hoy", icono: "asistencia", roles: ["ADMIN", "DIRECTOR", "UTP", "INSPECTOR"] },
      { href: "/admin/cierre-mensual", etiqueta: "Cierre mensual", icono: "asistencia", roles: ["ADMIN", "DIRECTOR", "UTP"] },
      { href: "/cierre-anual", etiqueta: "Cierre de año", icono: "calificaciones", roles: ["ADMIN", "DIRECTOR", "UTP"] },
      { href: "/admin/exportaciones", etiqueta: "Exportaciones", icono: "calificaciones", roles: ["ADMIN", "DIRECTOR", "UTP"] },
      { href: "/admin/onboarding", etiqueta: "Puesta en marcha", icono: "cursos", roles: ["ADMIN", "DIRECTOR"] },
      { href: "/admin/cumplimiento", etiqueta: "Cumplimiento", icono: "escudo", roles: ["ADMIN", "DIRECTOR", "UTP"] },
      { href: "/admin/prospectos", etiqueta: "Prospectos", icono: "comunicacion", roles: ["ADMIN"] },
    ],
  },
];

/** Navegación filtrada por rol: cada rol ve solo lo que le corresponde. */
function gruposPara(rol: string): Grupo[] {
  const visible = (i: Item) =>
    i.roles ? i.roles.includes(rol) : STAFF_GENERAL.includes(rol);
  return GRUPOS_BASE.map((g) => ({ ...g, items: g.items.filter(visible) })).filter(
    (g) => g.items.length > 0
  );
}

const TODAS_HREFS = GRUPOS_BASE.flatMap((g) => g.items.map((i) => i.href));

function esActivo(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  // Coincidencia exacta o de segmento hijo, evitando falsos positivos
  // (p. ej. /libro-clases no debe marcarse activo en /libro-clases/asistencia).
  const otros = TODAS_HREFS.filter(
    (h) => h !== href && h.startsWith(href + "/")
  );
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  return !otros.some((h) => pathname === h || pathname.startsWith(h + "/"));
}

export function NavEscritorio({
  rol,
  badges,
}: {
  rol: string;
  /** Contadores por href (p. ej. mensajes sin leer). */
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto">
      {gruposPara(rol).map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-tinta-tenue">
            {grupo.titulo}
          </p>
          <div className="space-y-0.5">
            {grupo.items.map((item) => {
              const activo = esActivo(pathname, item.href);
              const Icono = Iconos[item.icono];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  aria-current={activo ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    activo
                      ? "nav-activa text-white"
                      : "text-tinta-suave hover:translate-x-0.5 hover:bg-marca-50 hover:text-tinta"
                  }`}
                >
                  <Icono
                    className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                      activo ? "text-white" : "text-marca-400 group-hover:text-marca-600"
                    }`}
                  />
                  <span className="flex-1">{item.etiqueta}</span>
                  {(badges?.[item.href] ?? 0) > 0 && (
                    <span
                      className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                        activo ? "bg-white text-marca-700" : "bg-marca-600 text-white"
                      }`}
                    >
                      {badges![item.href] > 9 ? "9+" : badges![item.href]}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
