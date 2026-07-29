import { requerirRol } from "@/lib/sesion";
import { ImportadorCliente } from "./importador-cliente";

export const metadata = { title: "Migración asistida" };

export default async function Page() {
  await requerirRol("ADMIN", "DIRECTOR");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-marca-600">Administración</p>
        <h1 className="font-display text-2xl font-bold text-tinta">Migración asistida</h1>
        <p className="mt-1 max-w-2xl text-sm text-tinta-suave">
          Importa estudiantes y cursos desde tu plataforma anterior con archivos CSV. Descarga la
          plantilla, complétala y súbela: revisamos cada fila antes de importar y solo se cargan las
          filas válidas.
        </p>
      </header>

      <ImportadorCliente />
    </div>
  );
}
