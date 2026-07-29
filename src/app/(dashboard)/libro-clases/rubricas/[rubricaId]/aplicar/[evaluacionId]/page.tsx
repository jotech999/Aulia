import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { autorizarRubrica } from "@/lib/rubricas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { AplicacionRubricaCliente } from "./aplicacion-cliente";

export default async function AplicarRubricaPage({
  params,
}: {
  params: Promise<{ rubricaId: string; evaluacionId: string }>;
}) {
  const { rubricaId, evaluacionId } = await params;
  const { user } = await requerirSesion();
  const evaluacion = await prisma.evaluacion.findFirst({
    where: {
      id: evaluacionId,
      colegioId: user.colegioId,
      eliminadaEn: null,
      rubricaId,
    },
    select: {
      id: true,
      nombre: true,
      tipo: true,
      fecha: true,
      asignatura: {
        select: {
          id: true,
          nombre: true,
          docenteId: true,
          curso: {
            select: { id: true, nivel: true, letra: true, profesorJefeId: true },
          },
        },
      },
      rubrica: {
        select: {
          id: true,
          nombre: true,
          estado: true,
          eliminadaEn: true,
          criterios: {
            orderBy: { orden: "asc" },
            select: {
              id: true,
              descripcion: true,
              peso: true,
              puntajeMax: true,
              niveles: {
                orderBy: { orden: "asc" },
                select: { id: true, etiqueta: true, descriptor: true, puntaje: true },
              },
            },
          },
        },
      },
    },
  });
  if (
    !evaluacion?.rubrica ||
    evaluacion.rubrica.eliminadaEn ||
    !["PUBLICADA", "ARCHIVADA"].includes(evaluacion.rubrica.estado) ||
    !autorizarRubrica(user.rol, user.id, evaluacion.asignatura)
  ) {
    notFound();
  }

  const matriculas = await prisma.matricula.findMany({
    where: {
      colegioId: user.colegioId,
      cursoId: evaluacion.asignatura.curso.id,
      estado: "ACTIVA",
    },
    select: { estudiante: { select: { id: true, nombres: true, apellidos: true } } },
    orderBy: [{ estudiante: { apellidos: "asc" } }, { estudiante: { nombres: "asc" } }],
  });
  const estudiantesBase = matriculas.map(({ estudiante }) => estudiante);
  const aplicaciones = await prisma.aplicacionRubrica.findMany({
    where: {
      colegioId: user.colegioId,
      evaluacionId: evaluacion.id,
      rubricaId: evaluacion.rubrica.id,
      estudianteId: { in: estudiantesBase.map((estudiante) => estudiante.id) },
    },
    select: {
      id: true,
      estudianteId: true,
      estado: true,
      puntajeTotal: true,
      retroalimentacion: true,
      puntajes: {
        select: { criterioId: true, nivelId: true, comentario: true },
      },
    },
  });
  const aplicacionPorEstudiante = new Map(aplicaciones.map((aplicacion) => [aplicacion.estudianteId, aplicacion]));

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo={evaluacion.nombre}
        descripcion={`${evaluacion.asignatura.nombre} · ${evaluacion.asignatura.curso.nivel} ${evaluacion.asignatura.curso.letra} · ${evaluacion.rubrica.nombre}`}
        volver={{ href: `/libro-clases/rubricas/${evaluacion.rubrica.id}`, etiqueta: "Volver al instrumento" }}
      />

      <div className="mb-4 rounded-xl border-l-2 border-marca-500 bg-marca-50 px-4 py-3 text-sm text-marca-800">
        <strong>Evaluación con rúbrica:</strong> el resultado se guarda como puntaje y retroalimentación. No se convertirá ni publicará como nota sin una acción y regla explícitas.
      </div>

      {estudiantesBase.length === 0 ? (
        <EstadoVacio
          icono="estudiantes"
          titulo="Sin estudiantes activos"
          descripcion="Este curso no tiene matrículas activas para aplicar el instrumento."
        />
      ) : (
        <AplicacionRubricaCliente
          rubricaId={evaluacion.rubrica.id}
          evaluacionId={evaluacion.id}
          criterios={evaluacion.rubrica.criterios.map((criterio) => ({
            id: criterio.id,
            descripcion: criterio.descripcion,
            peso: Number(criterio.peso),
            puntajeMax: Number(criterio.puntajeMax),
            niveles: criterio.niveles.map((nivel) => ({
              id: nivel.id,
              etiqueta: nivel.etiqueta,
              descriptor: nivel.descriptor,
              puntaje: Number(nivel.puntaje),
            })),
          }))}
          estudiantes={estudiantesBase.map((estudiante) => {
            const aplicacion = aplicacionPorEstudiante.get(estudiante.id);
            return {
              id: estudiante.id,
              nombre: `${estudiante.apellidos}, ${estudiante.nombres}`,
              aplicacion: aplicacion
                ? {
                    id: aplicacion.id,
                    estado: aplicacion.estado,
                    puntajeTotal: aplicacion.puntajeTotal === null ? null : Number(aplicacion.puntajeTotal),
                    retroalimentacion: aplicacion.retroalimentacion ?? "",
                    puntajes: aplicacion.puntajes.map((puntaje) => ({
                      criterioId: puntaje.criterioId,
                      nivelId: puntaje.nivelId,
                      comentario: puntaje.comentario ?? "",
                    })),
                  }
                : null,
            };
          })}
        />
      )}
    </div>
  );
}
