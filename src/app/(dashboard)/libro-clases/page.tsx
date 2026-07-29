import Link from "next/link";
import { requerirSesion } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Iconos, type NombreIcono } from "@/components/ui/iconos";

const MODULOS: {
  href: string;
  titulo: string;
  icono: NombreIcono;
  descripcion: string;
}[] = [
  {
    href: "/libro-clases/asistencia",
    titulo: "Asistencia diaria",
    icono: "asistencia",
    descripcion: "Pasa la lista del curso y consulta el resumen mensual.",
  },
  {
    href: "/libro-clases/calificaciones",
    titulo: "Calificaciones",
    icono: "calificaciones",
    descripcion: "Libreta de notas por asignatura con promedios automáticos.",
  },
  {
    href: "/libro-clases/firma",
    titulo: "Leccionario",
    icono: "firma",
    descripcion: "Registra contenidos tratados y firma la clase realizada.",
  },
  {
    href: "/admin/estudiantes",
    titulo: "Anotaciones",
    icono: "estudiantes",
    descripcion: "Hoja de vida del estudiante: abre su ficha para anotar.",
  },
];

export default async function LibroClasesPage() {
  await requerirSesion();
  return (
    <div>
      <EncabezadoPagina
        icono="libro"
        titulo="Libro de clases"
        descripcion="Registro escolar según la Circular N°30."
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {MODULOS.map((m) => {
          const Icono = Iconos[m.icono];
          return (
            <li key={m.titulo}>
              <Link
                href={m.href}
                className="group flex h-full items-start gap-3.5 rounded-xl border border-borde bg-superficie p-4 shadow-suave transition-colors hover:border-borde-fuerte hover:bg-superficie-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600 transition-colors group-hover:bg-marca-100">
                  <Icono className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-tinta">{m.titulo}</p>
                  <p className="mt-0.5 text-sm text-tinta-suave">
                    {m.descripcion}
                  </p>
                </div>
                <span
                  className="ml-auto self-center text-tinta-tenue transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                >
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
