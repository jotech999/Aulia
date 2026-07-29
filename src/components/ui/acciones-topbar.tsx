import Link from "next/link";
import { Iconos, type NombreIcono } from "@/components/ui/iconos";

/**
 * Acciones rápidas de la barra superior (escritorio): las operaciones diarias
 * del staff a un clic desde cualquier página, sin volver al inicio.
 */

const STAFF = ["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR"];

const ACCIONES: { href: string; titulo: string; icono: NombreIcono }[] = [
  { href: "/libro-clases/asistencia", titulo: "Pasar lista", icono: "asistencia" },
  { href: "/libro-clases/calificaciones", titulo: "Poner notas", icono: "calificaciones" },
  { href: "/libro-clases/anotaciones", titulo: "Nueva anotación", icono: "convivencia" },
  { href: "/comunicacion", titulo: "Enviar comunicado", icono: "comunicacion" },
  { href: "/asistente-docente", titulo: "Asistente IA", icono: "planificacion" },
];

export function AccionesTopbar({ rol }: { rol: string }) {
  if (!STAFF.includes(rol)) return null;
  return (
    <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Acciones rápidas">
      {ACCIONES.map((a) => {
        const Icono = Iconos[a.icono];
        return (
          <Link
            key={a.href + a.titulo}
            href={a.href}
            prefetch
            title={a.titulo}
            aria-label={a.titulo}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-suave transition-colors hover:bg-marca-50 hover:text-marca-600"
          >
            <Icono className="h-[18px] w-[18px]" />
          </Link>
        );
      })}
    </nav>
  );
}
