import { requerirRol } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { MatricularForm } from "./matricular-cliente";
import { nombreCurso, ordenarCursos } from "@/lib/cursos";

export const metadata = { title: "Matricular estudiante" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ postulacionId?: string }>;
}) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const [cursos, postulacion] = await Promise.all([
    prisma.curso.findMany({
      where: { colegioId: user.colegioId },
      select: { id: true, nivel: true, letra: true },
      orderBy: [{ nivel: "asc" }, { letra: "asc" }],
    }),
    // Conversión admisión → matrícula: precarga los datos de la postulación.
    sp.postulacionId
      ? prisma.postulacion.findFirst({
          where: { id: sp.postulacionId, colegioId: user.colegioId },
          select: {
            nombres: true,
            apellidos: true,
            fechaNacimiento: true,
            nivelSolicitado: true,
            apoderadoNombre: true,
            email: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const inicial = postulacion
    ? {
        nombres: postulacion.nombres,
        apellidos: postulacion.apellidos,
        fechaNacimiento: postulacion.fechaNacimiento
          ? postulacion.fechaNacimiento.toISOString().slice(0, 10)
          : "",
        apoderadoNombre: postulacion.apoderadoNombre,
        apoderadoEmail: postulacion.email,
        nivelSolicitado: postulacion.nivelSolicitado,
      }
    : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        icono="estudiantes"
        titulo="Matricular estudiante"
        descripcion="Crea el estudiante, matricúlalo en un curso y, si quieres, agrega a su apoderado en un solo paso."
        volver={{ href: "/admin/estudiantes", etiqueta: "Estudiantes" }}
      />
      {inicial && (
        <p className="mt-4 rounded-xl border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-tinta">
          Datos precargados desde la postulación de admisión
          {inicial.nivelSolicitado ? ` (postula a ${inicial.nivelSolicitado})` : ""}. Completa el
          RUT, elige el curso y confirma. Al terminar, marca la postulación como
          «Matriculada» en la bandeja de admisión.
        </p>
      )}
      <MatricularForm
        cursos={ordenarCursos(cursos).map((c) => ({ id: c.id, etiqueta: nombreCurso(c) }))}
        inicial={inicial}
      />
    </div>
  );
}
