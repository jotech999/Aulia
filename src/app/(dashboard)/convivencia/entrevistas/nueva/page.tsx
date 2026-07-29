import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import {
  rolElegibleEntrevistas,
  whereEstudiantesEntrevista,
} from "@/lib/entrevistas";
import { hoyEnSantiago } from "@/lib/fecha";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { FormularioEntrevista } from "./formulario-cliente";
import { nombreCurso } from "@/lib/cursos";

export default async function NuevaEntrevistaPage({
  searchParams,
}: {
  searchParams: Promise<{ estudianteId?: string }>;
}) {
  const { user } = await requerirSesion();
  if (!rolElegibleEntrevistas(user.rol)) redirect("/dashboard");
  const sp = await searchParams;

  const estudiantes = await prisma.estudiante.findMany({
    where: whereEstudiantesEntrevista(user),
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { curso: { select: { nivel: true, letra: true } } },
        take: 1,
      },
      apoderados: {
        select: {
          id: true,
          parentesco: true,
          calidad: true,
          usuario: { select: { nombre: true } },
        },
        orderBy: [{ calidad: "asc" }, { usuario: { nombre: "asc" } }],
      },
    },
    orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
    take: 800,
  });

  const opciones = estudiantes.map((e) => ({
    id: e.id,
    nombre: `${e.apellidos}, ${e.nombres}`,
    curso: e.matriculas[0] ? nombreCurso(e.matriculas[0].curso) : "",
    apoderados: e.apoderados.map((apoderado) => ({
      id: apoderado.id,
      nombre: apoderado.usuario.nombre,
      parentesco: apoderado.parentesco,
      tipo:
        apoderado.calidad === "TITULAR"
          ? ("Titular" as const)
          : apoderado.calidad === "SUPLENTE"
            ? ("Suplente" as const)
            : ("Por confirmar" as const),
    })),
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        icono="convivencia"
        titulo="Registrar entrevista"
        descripcion="Reunión con apoderado — queda en la ficha del estudiante."
        volver={{ href: "/convivencia", etiqueta: "Convivencia" }}
      />
      <FormularioEntrevista
        estudiantes={opciones}
        preseleccion={sp.estudianteId}
        hoy={hoyEnSantiago()}
      />
    </div>
  );
}
