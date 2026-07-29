import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { periodosDeRegimen } from "../../calificaciones/consultas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Correccion } from "./correccion-cliente";

export default async function QuizDetallePage({ params }: { params: Promise<{ quizId: string }> }) {
  const { user } = await requerirSesion();
  const { quizId } = await params;

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, colegioId: user.colegioId, eliminadoEn: null },
    select: {
      id: true,
      titulo: true,
      asignaturaId: true,
      preguntas: {
        orderBy: { orden: "asc" },
        select: {
          pregunta: {
            select: {
              id: true, tipo: true, enunciado: true, puntaje: true, vfCorrecta: true,
              alternativas: { select: { id: true, texto: true, correcta: true }, orderBy: { orden: "asc" } },
            },
          },
        },
      },
      resultados: { select: { estudianteId: true, puntaje: true, puntajeMax: true, nota: true } },
    },
  });
  if (!quiz) notFound();

  const asignatura = await prisma.asignatura.findFirst({
    where: { id: quiz.asignaturaId, colegioId: user.colegioId },
    select: { nombre: true, cursoId: true, curso: { select: { nivel: true, letra: true, anioEscolar: { select: { regimen: true } } } } },
  });
  if (!asignatura) notFound();

  const matriculas = await prisma.matricula.findMany({
    where: { cursoId: asignatura.cursoId, colegioId: user.colegioId, estado: "ACTIVA" },
    orderBy: { estudiante: { apellidos: "asc" } },
    select: { estudiante: { select: { id: true, nombres: true, apellidos: true } } },
  });

  const preguntas = quiz.preguntas.map((qp) => qp.pregunta);
  const puntajeMax = preguntas.reduce((s, p) => s + p.puntaje, 0);
  const periodos = periodosDeRegimen(asignatura.curso.anioEscolar.regimen);

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo={quiz.titulo}
        descripcion={`${asignatura.nombre} · ${asignatura.curso.nivel} ${asignatura.curso.letra} · ${preguntas.length} preguntas · ${puntajeMax} puntos`}
        volver={{ href: `/libro-clases/evaluaciones?asignaturaId=`, etiqueta: "Volver" }}
      />
      <Correccion
        quizId={quiz.id}
        preguntas={preguntas}
        estudiantes={matriculas.map((m) => ({ id: m.estudiante.id, nombre: `${m.estudiante.apellidos}, ${m.estudiante.nombres}` }))}
        resultados={quiz.resultados}
        periodos={periodos}
        tituloSugerido={quiz.titulo}
      />
    </div>
  );
}
