import Link from "next/link";
import { Iconos, type NombreIcono } from "@/components/ui/iconos";

/**
 * Accesos rápidos del inicio: las acciones más frecuentes de cada rol, a un
 * toque desde el dashboard. Complementan la paleta de comandos (Ctrl+K) para
 * quienes prefieren botones visibles (feedback de docentes y dirección).
 */

type Acceso = {
  href: string;
  etiqueta: string;
  descripcion: string;
  icono: NombreIcono;
};

const DOCENTE: Acceso[] = [
  { href: "/libro-clases/asistencia", etiqueta: "Pasar lista", descripcion: "Asistencia del día", icono: "asistencia" },
  { href: "/libro-clases/calificaciones", etiqueta: "Poner notas", descripcion: "Libreta de calificaciones", icono: "calificaciones" },
  { href: "/libro-clases/firma", etiqueta: "Firmar leccionario", descripcion: "Registrar la clase", icono: "firma" },
  { href: "/libro-clases/anotaciones", etiqueta: "Anotación", descripcion: "Positiva o negativa", icono: "convivencia" },
  { href: "/asistente-docente", etiqueta: "Guía con IA", descripcion: "Material imprimible", icono: "planificacion" },
  { href: "/comunicacion", etiqueta: "Comunicado", descripcion: "Avisar a apoderados", icono: "comunicacion" },
];

const DIRECCION: Acceso[] = [
  { href: "/admin/asistencia-hoy", etiqueta: "Asistencia de hoy", descripcion: "Cursos sin lista pasada", icono: "asistencia" },
  { href: "/alertas", etiqueta: "Alertas", descripcion: "Estudiantes en riesgo", icono: "alertas" },
  { href: "/comunicacion", etiqueta: "Comunicado", descripcion: "A toda la comunidad", icono: "comunicacion" },
  { href: "/admin/estudiantes", etiqueta: "Estudiantes", descripcion: "Fichas y matrícula", icono: "estudiantes" },
  { href: "/admin/cumplimiento", etiqueta: "Cumplimiento", descripcion: "Circular 30 · Decreto 67", icono: "escudo" },
  { href: "/asistente-docente", etiqueta: "Asistente IA", descripcion: "Borradores y material", icono: "planificacion" },
];

const INSPECTOR: Acceso[] = [
  { href: "/libro-clases/asistencia", etiqueta: "Pasar lista", descripcion: "Asistencia del día", icono: "asistencia" },
  { href: "/inspector/justificaciones", etiqueta: "Justificaciones", descripcion: "Bandeja de inasistencias", icono: "firma" },
  { href: "/libro-clases/anotaciones", etiqueta: "Anotación", descripcion: "Registro de conducta", icono: "convivencia" },
  { href: "/convivencia", etiqueta: "Convivencia", descripcion: "Casos y seguimiento", icono: "alertas" },
];

const POR_ROL: Record<string, Acceso[]> = {
  PROFESOR: DOCENTE,
  PROFESOR_JEFE: DOCENTE,
  ADMIN: DIRECCION,
  DIRECTOR: DIRECCION,
  UTP: DIRECCION,
  INSPECTOR,
};

export function AccesosRapidos({ rol }: { rol: string }) {
  const accesos = POR_ROL[rol];
  if (!accesos?.length) return null;

  return (
    <nav aria-label="Accesos rápidos" className="surgir-secuencia mt-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {accesos.map((a) => {
          const Icono = Iconos[a.icono];
          return (
            <Link
              key={a.href + a.etiqueta}
              href={a.href}
              prefetch
              className="superficie tarjeta-int group flex flex-col gap-2 rounded-xl p-3.5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-50 text-marca-600 transition-colors group-hover:bg-marca-500 group-hover:text-white">
                <Icono className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-tinta">{a.etiqueta}</span>
                <span className="block truncate text-[11px] leading-snug text-tinta-tenue">{a.descripcion}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
