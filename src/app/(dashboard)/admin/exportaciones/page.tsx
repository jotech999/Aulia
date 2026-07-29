import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { PanelExportaciones } from "./exportaciones-cliente";
import { ordenarCursos } from "@/lib/cursos";

export default async function ExportacionesPage() {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "UTP");

  const cursos = await prisma.curso.findMany({
    where: { colegioId: user.colegioId },
    select: { id: true, nivel: true, letra: true },
    orderBy: [{ nivel: "asc" }, { letra: "asc" }],
  });

  return (
    <div className="mx-auto max-w-3xl">
      <EncabezadoPagina
        icono="calificaciones"
        titulo="Exportaciones y reportes"
        descripcion="Reportes normativos por curso: asistencia para SIGE, actas y respaldo del libro (Circular 30)."
      />
      <div className="mt-5">
        <PanelExportaciones cursos={ordenarCursos(cursos)} anio={new Date().getUTCFullYear()} />
      </div>
    </div>
  );
}
